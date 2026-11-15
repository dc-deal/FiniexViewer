import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Page, Route } from '@playwright/test'

/**
 * The backend, replayed from the unit fixtures.
 *
 * **Nothing here is hand-written**, and that is the rule rather than a preference: a mock typed
 * out inside a spec is a SECOND mirror of the HTTP contract, and a second mirror goes stale in
 * silence. It has already happened once at the unit level — a field changed shape while every
 * fixture held the empty value, so a green suite proved nothing. These bodies are the same
 * captures the unit suite and the contract test read, under the contract their manifest records.
 *
 * Read from disk rather than imported: Node 20 requires an import attribute for JSON in ESM, and
 * the alternative was bending the app's module settings to suit a test helper.
 *
 * The consequence of using real captures is that the mock is COHERENT rather than convenient: the
 * report fixtures all came from ONE run, and our client raises `RunIdMismatchError` when a body
 * names a different run than the request did. So the reports answer for that run and 404 for any
 * other, exactly as the real server would — the guard stays armed instead of being mocked away.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures')

/** One capture, parsed. Exported so a spec can derive its own facts from the same files. */
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'))
}

const REPORTS: Record<string, string> = {
  'header': 'run_header.json',
  'run-summary': 'run_summary.json',
  'warnings-errors': 'warnings_errors.json',
  'portfolio': 'portfolio.json',
  'broker': 'broker.json',
  'aggregated-portfolio': 'aggregated_portfolio.json',
  'pending-orders': 'pending_orders.json',
  'order-history': 'order_history.json',
  'booking-periods': 'run_booking_periods.json',
  'trade-history': 'trade_history.json',
  'scenario-details': 'scenario_details.json',
  'config': 'run_config_simulation.json',
  // the live run's: the report route below serves a capture only under the run it names
  'venue-account': 'venue_account.json',
}

/**
 * The sessions the latest-state-frame captures came from, read off the captures rather than
 * transcribed: the ended one is the session its frames over time were captured from — the first
 * ended row of the index is the one listed newest, which since contract 55 is the session that
 * draws — and the stopped one the first row of the index in that state, the only one it holds.
 */
export const STATE_FRAME_RUNS: Record<'ended' | 'stopped', string> = (() => {
  const rows = (fixture('runs_list.json') as { runs: { run_id: string, recording: string | null }[] }).runs
  return {
    ended: (fixture('recorded_window.json') as { run_id: string }).run_id,
    stopped: rows.find(row => row.recording === 'stopped')?.run_id ?? '',
  }
})()

/** The session whose drawing workers were captured (contract 55): its timeline, a window of it, its market. */
export const SERIES_RUN = (fixture('recorded_window_series.json') as { run_id: string }).run_id

/** The run every report capture was taken from — the only one the mock can answer for. */
export const FIXTURE_RUN = (fixture('scenario_details.json') as { run_id: string }).run_id

/** The live run whose whole stream is captured, the venue's reads in it — and its venue account. */
export const LIVE_RUN = (fixture('order_events_live.json') as { run_id: string }).run_id

/**
 * The deployment the ledger captures belong to, read from the capture rather than transcribed —
 * the same rule the run id follows, so a re-capture cannot strand it.
 */
/**
 * The FAMILY the fixture run belongs to, or null where it stands alone.
 *
 * The run list groups by family — the parent where the backend states one, the set name otherwise
 * — and a family of several opens CLOSED: a set or a deployment shows its newest run, the earlier
 * ones behind the button beside it, and a sweep shows a heading. So the run a spec wants may not be
 * in the document until the fold is opened, which is exactly what a reader does. Derived from the
 * captured index rather than transcribed, so a re-capture that moves the run cannot strand it.
 */
const FIXTURE_FAMILY = (() => {
  const rows = (fixture('runs_list.json') as {
    runs: { run_id: string, name: string, parent_id: string | null, parent_kind: string | null, start_time: string }[]
  }).runs
  const mine = rows.find(row => row.run_id === FIXTURE_RUN)
  if (!mine) return null
  const key = mine.parent_id ?? mine.name
  const family = rows.filter(row => (row.parent_id ?? row.name) === key)
  if (family.length < 2) return null
  const newest = family.every(row => Date.parse(row.start_time) <= Date.parse(mine.start_time))
  return { key, sweep: mine.parent_kind === 'sweep', newest }
})()

/**
 * Puts the fixture run's row in the document, opening its family where it has one. A spec that
 * CLICKS a run calls this first; one that reaches a run by url does not need it.
 */
export async function revealFixtureRun(page: Page): Promise<void> {
  if (!FIXTURE_FAMILY) return
  const { key, sweep, newest } = FIXTURE_FAMILY
  if (sweep) {
    await page.locator('.run-list .record-group', { hasText: key }).first().click()
    return
  }
  // the family's newest run IS its line
  if (newest) return
  await page.locator('.run-list .record-headed', { has: page.locator(`.run-name[title="${key}"]`) })
    .first().locator('[data-action="fold"]').click()
}

export const FIXTURE_DEPLOYMENT =
  (fixture('deployment_detail.json') as { deployment_id: string }).deployment_id

/**
 * The shell's own routes. These are NOT contract mirrors and must not be read as one — they are
 * the smallest bodies that let the page render, so a run test is not drowned in sidebar errors.
 * Capturing them properly is follow-up work; nothing asserts on them.
 */
const SHELL: Record<string, unknown> = {
  '/api/v1/brokers': { brokers: [] },
  // captured: the run chart orders the timeframes and picks one by their lengths
  '/api/v1/timeframes': fixture('timeframes.json'),
  // what every check id a warning names means — read once by the warnings section
  '/api/v1/validation-checks': fixture('validation_checks.json'),
  '/api/v1/caller': {
    enforced: false, client: null, account: null, account_kind: null, display_name: null, grants: null, note: null,
  },
}

function absent(cause: string, detail: string) {
  return {
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: cause, detail }),
  }
}

/**
 * The header the backend stamps every response with, read from the captures' own manifest.
 *
 * Written out here it was the kind of number that stays at 11 while the fixtures move to 21, and
 * that is what it did. The menu bar reads it since 2026-10-27 and marks a server stamped with
 * another contract than the viewer mirrors — so a hand-written number here would also draw that
 * mark in every spec.
 */
const CONTRACT = {
  'X-Api-Contract': String((fixture('capture_manifest.json') as { contract: number }).contract),
}

/**
 * One section served with a single field of the WRONG SHAPE, so the panel reading it throws while
 * rendering.
 *
 * Fault injection, not a second mirror: the body is the real capture with one field overwritten,
 * so everything else about it stays coherent and only the named read fails. The shape is wrong
 * rather than null on purpose — a null passes a nullish guard, and what the boundary exists for is
 * the case the mirror did not predict.
 */
/** A list of servers as the dev server keeps it, for a spec that needs more than the default one. */
export interface MockServer {
  id: string
  name: string | null
  url: string
  isDefault: boolean
  hasToken: boolean
  tunnel: null
  tunnelState: 'none'
  tunnelMessage: null
  hostId: string | null
}

const DEFAULT_MOCK_SERVER: MockServer = {
  id: 'default', name: 'Development', url: 'http://backend:8000', isDefault: true, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: 'h_x29og8',
}

interface ApiMockOptions {
  servers?: MockServer[]
  corrupt?: { section: string, field: string }
  /**
   * Levels set on one position's trade rows. No trade of the fixture run set a stop or a target, so
   * a check of the levels the run chart draws hands one position the two that a run with levels
   * serves — the rest of the capture stays as it was.
   */
  levels?: { scenario: string, position: string, stopLoss: number, takeProfit: number }
  /**
   * An own level on one position's trade rows: the one that fired, and which of the two it was. No
   * stored run carries one yet (measured 2026-10-30), so a check of what the run chart draws for it
   * hands one position the fields a run of such a strategy serves.
   */
  ownLevel?: { scenario: string, position: string, level: number, reason: string }
  /**
   * What the framework's tree held uncommitted, in the run's header. The fixture run's tree is clean,
   * so a check of the card that lists the changes hands it the paths of a dirty one.
   */
  changes?: string[]
  /**
   * Rows appended to the captured activities. The capture holds whatever ran when it was taken, so
   * an activity a spec relies on is built from the server's row by the spec that needs one.
   */
  activities?: Record<string, unknown>[]
  /**
   * A unit's first tick earlier than captured — where the run chart's window begins. The captured
   * units span an hour each, inside one batch of bars; a spec of bars loaded as the view moves widens
   * one over both stretches of the captured EURGBP bars, three weeks apart.
   */
  firstTick?: { unit: string, at: string }
}

/** A number where a list belongs: `.filter` on it throws, which is how the original defect landed. */
const WRONG_SHAPE = 0

/** Only what the mock reads off the stream capture to decide which position it answers for. */
interface StreamCapture {
  events: { scenario_name: string, order_id: string }[]
  broker_truth: unknown[]
  count: number
}

/** Serves every `/api/v1/**` call from the captures. Anything unmapped fails loudly, never silently. */
export async function mockApi(page: Page, options: ApiMockOptions = {}): Promise<void> {
  // the list is the dev server's own file: a spec must never write the operator's
  let servers = options.servers ?? [DEFAULT_MOCK_SERVER]
  await page.route('**/__viewer/servers**', async (route: Route) => {
    const request = route.request()
    const id = new URL(request.url()).pathname.split('/')[3]
    if (request.method() === 'POST') {
      const edit = request.postDataJSON() as { name?: string, url: string, token?: string }
      const name = edit.name ?? 'new'
      servers = [...servers, { id: name.toLowerCase(), name, url: edit.url, isDefault: false, hasToken: Boolean(edit.token), tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: null }]
    } else if (request.method() === 'PUT') {
      const { token, ...edit } = request.postDataJSON() as Partial<MockServer> & { token?: string }
      servers = servers.map(server => (server.id === id
        ? { ...server, ...edit, hasToken: server.hasToken || Boolean(token) }
        : server))
    } else if (request.method() === 'DELETE') {
      servers = servers.filter(server => server.id !== id)
    }
    return route.fulfill({ json: { servers, secretFiles: [] } })
  })
  await page.route('**/api/v1/**', async (route: Route) => {
    // every server answers from the same captures: which one was asked is the spec's to check
    const path = new URL(route.request().url()).pathname.replace(/^\/server\/[^/]+/, '')

    if (path === '/api/v1/health') {
      return route.fulfill({ json: fixture('health.json'), headers: CONTRACT })
    }

    const shell = SHELL[path]
    if (shell) return route.fulfill({ json: shell, headers: CONTRACT })

    if (path === '/api/v1/reports/runs') {
      return route.fulfill({ json: fixture('runs_list.json'), headers: CONTRACT })
    }

    if (path === '/api/v1/machine-resources') {
      return route.fulfill({ json: fixture('machine_resources.json'), headers: CONTRACT })
    }

    // what ran on the machine at capture time: the server's own row at least
    if (path === '/api/v1/activities') {
      const captured = fixture('activities.json') as { activities: unknown[] }
      const json = options.activities ? { ...captured, activities: [...captured.activities, ...options.activities] } : captured
      return route.fulfill({ json, headers: CONTRACT })
    }

    /*
     * The MARKET plane, for the run chart: the coverage of the two markets the fixture run traded,
     * and the M1 bars captured over its units' spans. A market or timeframe not captured answers
     * 404, as the server does for one it holds nothing for; the bars are served for the range asked,
     * the way the route cuts them, and never truncated — the spans are far below its cap.
     */
    const market = /^\/api\/v1\/brokers\/([^/]+)\/symbols\/([^/]+)\/(coverage|bars)$/.exec(path)
    if (market) {
      const [, broker, symbol, what] = market
      const asked = new URL(route.request().url()).searchParams
      const name = what === 'coverage'
        ? `coverage_${broker}_${symbol}.json`
        : `bars_${broker}_${symbol}_${asked.get('timeframe')}.json`
      if (!existsSync(join(FIXTURES, name))) return route.fulfill(absent('no_bars_indexed', `No capture ${name}`))
      if (what === 'coverage') return route.fulfill({ json: fixture(name), headers: CONTRACT })
      const from = Date.parse(asked.get('from') ?? '') / 1000
      const to = Date.parse(asked.get('to') ?? '') / 1000
      // as the route cuts them: the bars that OPEN in the range
      const rows = (fixture(name) as { t: number }[]).filter(bar => bar.t >= from && bar.t <= to)
      return route.fulfill({ json: rows, headers: { ...CONTRACT, 'X-Bar-Truncated': 'false' } })
    }

    /*
     * The CHECK-IN on a session, captured in the two states a stored session keeps — each for the
     * session it came from, and `state_frames_not_recorded` for every other run, as a backtest answers.
     */
    const latest = /^\/api\/v1\/reports\/runs\/([^/]+)\/state-frames\/latest$/.exec(path)
    if (latest) {
      const state = (Object.keys(STATE_FRAME_RUNS) as ('ended' | 'stopped')[])
        .find(key => STATE_FRAME_RUNS[key] === latest[1])
      if (!state) return route.fulfill(absent('state_frames_not_recorded', 'This run records no state frames.'))
      return route.fulfill({ json: fixture(`state_frames_${state}.json`), headers: CONTRACT })
    }

    /*
     * A unit's frames OVER TIME, of the ended session: the three captured frames, and a timeline
     * that counts those three — so the two answers agree on what exists, and a player opened on them
     * can reach either end. Every other run records nothing over time, as a backtest answers.
     */
    const recorded = /^\/api\/v1\/reports\/runs\/([^/]+)\/units\/([^/]+)\/recorded-streams(\/window)?$/.exec(path)
    if (recorded && recorded[1] === SERIES_RUN) {
      // the session that draws: its timeline as captured, and its captured window's frames and
      // series' bars of the range asked — every one of them, as one page
      if (!recorded[3]) return route.fulfill({ json: fixture('recorded_streams_series.json'), headers: CONTRACT })
      const page = fixture('recorded_window_series.json') as {
        state_frames: { frame_time: string }[], indicator_series: { times: string[], data: Record<string, unknown[]> }[]
      }
      const asked = new URL(route.request().url()).searchParams
      const from = asked.get('from') ? Date.parse(asked.get('from')!) : -Infinity
      const to = asked.get('to') ? Date.parse(asked.get('to')!) : Infinity
      const inside = (time: string) => Date.parse(time) >= from && Date.parse(time) < to
      const frames = page.state_frames.filter(frame => inside(frame.frame_time))
      const series = page.indicator_series.map(entry => {
        const kept = entry.times.flatMap((time, index) => inside(time) ? [index] : [])
        return {
          ...entry,
          times: kept.map(index => entry.times[index]!),
          data: Object.fromEntries(Object.entries(entry.data).map(([id, values]) => [id, kept.map(index => values[index])])),
        }
      }).filter(entry => entry.times.length)
      const count = frames.length + series.reduce((sum, entry) => sum + entry.times.length, 0)
      return route.fulfill({
        json: { ...page, matched: count, returned: count, truncated: false, next_from: null, state_frames: frames, indicator_series: series },
        headers: CONTRACT,
      })
    }
    if (recorded) {
      if (recorded[1] !== STATE_FRAME_RUNS.ended) {
        return route.fulfill(absent('streams_not_recorded', 'This run records no stream over time.'))
      }
      const page = fixture('recorded_window.json') as { state_frames: { frame_time: string }[] }
      const frames = page.state_frames
      if (!recorded[3]) {
        const timeline = fixture('recorded_streams.json') as { streams: Record<string, unknown>[] }
        const streams = timeline.streams.map(stream => ({
          ...stream,
          record_count: frames.length,
          first_record_time: frames[0]!.frame_time,
          last_record_time: frames.at(-1)!.frame_time,
        }))
        return route.fulfill({ json: { ...timeline, streams }, headers: CONTRACT })
      }
      const asked = new URL(route.request().url()).searchParams
      const from = asked.get('from') ? Date.parse(asked.get('from')!) : -Infinity
      const to = asked.get('to') ? Date.parse(asked.get('to')!) : Infinity
      const inWindow = frames.filter(frame => Date.parse(frame.frame_time) >= from && Date.parse(frame.frame_time) < to)
      return route.fulfill({
        json: {
          ...page, matched: inWindow.length, returned: inWindow.length, truncated: false, next_from: null,
          state_frames: inWindow,
        },
        headers: CONTRACT,
      })
    }

    /*
     * The STREAM, which is the one report route that is NARROWED — it is asked for one position,
     * not for the run. So the capture answers for that one position and an empty stream for any
     * other, which keeps the mock coherent rather than convenient: serving one position's steps
     * under every position would put the wrong order's life on screen and no assertion would say
     * so. `broker_truth` is empty on a narrowed answer by design, and the capture carries that.
     */
    const stream = /^\/api\/v1\/reports\/runs\/([^/]+)\/order-events$/.exec(path)
    if (stream) {
      // the live run's stream is asked for WHOLE, for the venue's reads — and captured whole
      if (stream[1] === LIVE_RUN && !new URL(route.request().url()).searchParams.has('order_id')) {
        return route.fulfill({ json: fixture('order_events_live.json'), headers: CONTRACT })
      }
      if (stream[1] !== FIXTURE_RUN) {
        return route.fulfill(absent('run_not_found', `Only ${FIXTURE_RUN} is captured`))
      }
      const asked = new URL(route.request().url()).searchParams
      const body = fixture('order_events.json') as StreamCapture
      const first = body.events[0]
      const mine = asked.get('scenario_name') === first?.scenario_name
        && asked.get('order_id') === first?.order_id
      if (mine) return route.fulfill({ json: body, headers: CONTRACT })
      return route.fulfill({
        json: { ...body, events: [], broker_truth: [], count: 0 },
        headers: CONTRACT,
      })
    }

    const report = /^\/api\/v1\/reports\/runs\/([^/]+)\/([a-z-]+)$/.exec(path)
    if (report) {
      const runId = report[1] as string
      const section = report[2] as string
      const file = REPORTS[section]
      if (!file) {
        return route.fulfill(absent('artifact_not_produced', `No capture for section '${section}'`))
      }
      // the session that draws is captured with its configuration alone: it names its market
      if (runId === SERIES_RUN && section === 'config') {
        return route.fulfill({ json: fixture('run_config_series.json'), headers: CONTRACT })
      }
      // a body naming another run would trip our own RunIdMismatchError — so it is not served
      if (runId !== FIXTURE_RUN) {
        return route.fulfill(absent('run_not_found', `Only ${FIXTURE_RUN} is captured`))
      }
      const body = fixture(file) as Record<string, unknown>
      if (options.corrupt && options.corrupt.section === section) {
        body[options.corrupt.field] = WRONG_SHAPE
      }
      const firstTick = options.firstTick
      if (firstTick && section === 'scenario-details') {
        body['units'] = (body['units'] as Record<string, unknown>[]).map(row =>
          row['name'] === firstTick.unit ? { ...row, first_tick_time: firstTick.at } : row)
      }
      const changes = options.changes
      if (changes && section === 'header') {
        const code = body['code_identity'] as Record<string, Record<string, unknown>>
        code['framework'] = { ...code['framework'], dirty: true, uncommitted_count: changes.length, changes }
      }
      const ownLevel = options.ownLevel
      if (ownLevel && section === 'trade-history') {
        body['trades'] = (body['trades'] as Record<string, unknown>[]).map(row =>
          row['scenario_name'] === ownLevel.scenario && row['position_id'] === ownLevel.position
            ? { ...row, stop_loss: null, take_profit: null, exit_level: ownLevel.level, close_reason: ownLevel.reason }
            : row)
      }
      const levels = options.levels
      if (levels && section === 'trade-history') {
        body['trades'] = (body['trades'] as Record<string, unknown>[]).map(row =>
          row['scenario_name'] === levels.scenario && row['position_id'] === levels.position
            ? { ...row, stop_loss: levels.stopLoss, take_profit: levels.takeProfit }
            : row)
      }
      return route.fulfill({ json: body, headers: CONTRACT })
    }

    /*
     * The LEDGER plane. It went unserved until 2026-10-01, so the deployments view, its picker and
     * its timeline had never been in a browser test at all — and the misaligned figure cells the
     * geometry assertion later found on the run side were present there too, unseen.
     */
    if (path === '/api/v1/deployments') {
      return route.fulfill({ json: fixture('deployments_list.json'), headers: CONTRACT })
    }

    const ledger = /^\/api\/v1\/deployments\/([^/]+)(?:\/([a-z-]+))?$/.exec(path)
    if (ledger) {
      const id = ledger[1] as string
      if (id !== FIXTURE_DEPLOYMENT) {
        return route.fulfill(absent('deployment_not_found', `Only ${FIXTURE_DEPLOYMENT} is captured`))
      }
      const section = ledger[2]
      if (!section) {
        return route.fulfill({ json: fixture('deployment_detail.json'), headers: CONTRACT })
      }
      if (section === 'booking-periods') {
        return route.fulfill({
          json: fixture('deployment_booking_periods.json'),
          headers: CONTRACT,
        })
      }
      return route.fulfill(absent('artifact_not_produced', `No capture for ledger '${section}'`))
    }

    // the SWEEP plane: every search on record, and the one captured ranked by its objective
    if (path === '/api/v1/sweeps') {
      return route.fulfill({ json: fixture('sweeps_list.json'), headers: CONTRACT })
    }

    const sweep = /^\/api\/v1\/sweeps\/([^/]+)$/.exec(path)
    if (sweep) {
      const captured = fixture('sweep_detail.json') as { sweep_id: string }
      if (sweep[1] !== captured.sweep_id) {
        return route.fulfill(absent('sweep_not_found', `Only ${captured.sweep_id} is captured`))
      }
      return route.fulfill({ json: captured, headers: CONTRACT })
    }

    return route.fulfill(absent('not_mocked', `No fixture routes ${path}`))
  })
}
