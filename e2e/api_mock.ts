import { readFileSync } from 'node:fs'
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

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'))
}

const REPORTS: Record<string, string> = {
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
}

/** The run every report capture was taken from — the only one the mock can answer for. */
export const FIXTURE_RUN = (fixture('scenario_details.json') as { run_id: string }).run_id

/**
 * The deployment the ledger captures belong to, read from the capture rather than transcribed —
 * the same rule the run id follows, so a re-capture cannot strand it.
 */
export const FIXTURE_DEPLOYMENT =
  (fixture('deployment_detail.json') as { deployment_id: string }).deployment_id

/**
 * The shell's own routes. These are NOT contract mirrors and must not be read as one — they are
 * the smallest bodies that let the page render, so a run test is not drowned in sidebar errors.
 * Capturing them properly is follow-up work; nothing asserts on them.
 */
const SHELL: Record<string, unknown> = {
  '/api/v1/brokers': { brokers: [] },
  '/api/v1/timeframes': { timeframes: [] },
  '/api/v1/caller': { authenticated: false, account: null, display_name: null, grants: [] },
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
 * that is what it did. Nothing reads the header today, so it cost nothing — but the file states
 * that none of its bodies is hand-written, and a hand-written version number is the same promise
 * broken in one line.
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
interface ApiMockOptions {
  corrupt?: { section: string, field: string }
}

/** A number where a list belongs: `.filter` on it throws, which is how the original defect landed. */
const WRONG_SHAPE = 0

/** Serves every `/api/v1/**` call from the captures. Anything unmapped fails loudly, never silently. */
export async function mockApi(page: Page, options: ApiMockOptions = {}): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname

    const shell = SHELL[path]
    if (shell) return route.fulfill({ json: shell, headers: CONTRACT })

    if (path === '/api/v1/reports/runs') {
      return route.fulfill({ json: fixture('runs_list.json'), headers: CONTRACT })
    }

    const report = /^\/api\/v1\/reports\/runs\/([^/]+)\/([a-z-]+)$/.exec(path)
    if (report) {
      const runId = report[1] as string
      const section = report[2] as string
      const file = REPORTS[section]
      if (!file) {
        return route.fulfill(absent('artifact_not_produced', `No capture for section '${section}'`))
      }
      // a body naming another run would trip our own RunIdMismatchError — so it is not served
      if (runId !== FIXTURE_RUN) {
        return route.fulfill(absent('run_not_found', `Only ${FIXTURE_RUN} is captured`))
      }
      const body = fixture(file) as Record<string, unknown>
      if (options.corrupt && options.corrupt.section === section) {
        body[options.corrupt.field] = WRONG_SHAPE
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

    return route.fulfill(absent('not_mocked', `No fixture routes ${path}`))
  })
}
