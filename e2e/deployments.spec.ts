import type { Page } from '@playwright/test'
import { test, expect } from './cdp_fixture'
import { mockApi, FIXTURE_DEPLOYMENT, fixture } from './api_mock'
import { openWith, showPanel } from './arrangement_seed'
import { expectHeadingsReadable } from './list_geometry'

/**
 * The LEDGER view, which had no browser coverage at all until 2026-10-01 — `api_mock.ts` served
 * only the run plane, so the deployments page, its picker and its timeline had never been opened by
 * a test. The three captures existed the whole time.
 *
 * What this holds is what jsdom cannot: a real reload of a real URL, and the geometry of a list.
 */

/**
 * A FIGURE CELL is right-aligned, so it stands under its own right-aligned heading.
 *
 * `figure: true` aligns the HEADING, which the stem owns; the cells come from the caller's slot, so
 * the caller aligns those. Measured 2026-09-30 across every ranked list: three of the four had
 * figure cells sitting up to 172 px left of the heading they belong to — every declaration correct
 * and the geometry not, which is why no unit test saw it.
 *
 * This asserts the DECLARATION rather than the pixels, and that is a correction rather than a
 * shortcut. Three attempts to measure the geometry each disagreed with the screen: `scrollWidth`
 * counts padding differently once a box clips, a Range over right-aligned text reports the line box
 * rather than the ink, and a Range over CLIPPED text reports the text that is not drawn — which
 * made a perfectly placed cell read as 27 px out. A check that cannot be trusted is worse than
 * none, and the property it was chasing is one line of computed style.
 *
 * Either mechanism counts: `text-align: right` on the cell, or a flex row ending at the right,
 * which is how the run list stacks two figures in one cell.
 */
async function expectFiguresRightAligned(page: Page, selector: string): Promise<void> {
  const wrong = await page.locator(selector).first().evaluate(shell => {
    const list = shell.querySelector('.record-list')!
    const heads = [...list.querySelectorAll('.record-head > span')]
    const cells = [...list.querySelector('.record-row')!.children]
    const out: string[] = []
    heads.forEach((head, index) => {
      if (!head.classList.contains('head-figure')) return
      const cell = cells[index] as HTMLElement | undefined
      if (!cell || getComputedStyle(cell).display === 'none') return
      const style = getComputedStyle(cell)
      // three mechanisms, because all three are in use: plain text alignment, a flex ROW ending at
      // the right, and a flex COLUMN whose items are pushed to the right edge — the run list stacks
      // one figure per account currency that way
      const flex = style.display.includes('flex')
      const column = style.flexDirection.startsWith('column')
      const right = style.textAlign === 'right'
        || (flex && !column && style.justifyContent === 'flex-end')
        || (flex && column && style.alignItems === 'flex-end')
      if (!right) {
        out.push(`${head.textContent?.trim()} (text-align: ${style.textAlign})`)
      }
    })
    return out
  })
  expect(wrong, `${selector}: a figure cell is not right-aligned under its heading`).toEqual([])
}

async function openLedger(page: Page): Promise<void> {
  await page.goto('/')
  await showPanel(page, 'Deployments')
  await expect(page.locator('.deployment-list .record-row').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('the picker lists the ledger and choosing one opens its history', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)

  // what the select box it replaced could not show: the figures are on the row, before the choice
  const first = page.locator('.deployment-list .record-row').first()
  await expect(first).toContainText('deploy_')
  await expect(first).toContainText('USD')

  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()

  // the pick shows the deployment's bundle beside the list, which stays whole and marks it (viewer#43)
  await expect(page.locator('.deployment-bundle .chosen-id')).toContainText(FIXTURE_DEPLOYMENT)
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
  await expect(page.locator('.deployment-list .record-row.picked')).toContainText(FIXTURE_DEPLOYMENT)
})

/**
 * The selection is stored with the arrangement, and a reload is the one thing jsdom can only
 * approximate.
 */
/**
 * A run opened from the deployment shows ITS figures. The Runs panel stays mounted in the dock, and
 * a jump that only changed the context reloaded the sections while the executive summary stayed on
 * the run before — reported 2026-10-14 from a real screen. Each session's summary is answered with
 * its own net P&L here, so the two runs cannot be mistaken for each other.
 */
test('each run opened from the deployment shows its own executive summary', async ({ page }) => {
  const sessions = (fixture('deployment_detail.json') as { sessions: { run_id: string }[] }).sessions
  const marks = new Map(sessions.slice(0, 2).map((session, index) => [session.run_id, index === 0 ? 111.11 : 222.22]))
  await page.route('**/api/v1/reports/runs/*/run-summary', async route => {
    const runId = new URL(route.request().url()).pathname.split('/').at(-2)!
    const mark = marks.get(runId)
    if (mark === undefined) return route.fallback()
    const body = structuredClone(fixture('run_summary.json')) as { run_id: string, currencies: { net_pnl: number }[] }
    body.run_id = runId
    for (const row of body.currencies) row.net_pnl = mark
    return route.fulfill({ json: body })
  })

  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  const links = page.locator('.sessions-list .session-run button')
  const executive = page.locator('[data-panel="executive"]')

  await links.nth(0).click()
  await expect(executive).toContainText('111.11')

  await showPanel(page, 'Deployment bundle')
  await links.nth(1).click()
  await expect(executive).toContainText('222.22')
  await expect(executive).not.toContainText('111.11')
})

/**
 * A change mark says WHERE; the configuration on either side of it is a click away, opened as a
 * panel of its own. The links stand on the dashed line beside the words, and in a narrow panel
 * the words give way first — a cut link would leave nothing to click.
 */
test('a change mark opens the configuration of a session beside it, its links whole', async ({ page }) => {
  // about the list floor: the narrowest the Deployments panel stands
  await page.setViewportSize({ width: 520, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  // one group at this width: a pick never covers its list, so the bundle is a tab to bring forward
  await showPanel(page, 'Deployment bundle')
  const lead = page.locator('.sessions-list .record-lead', { hasText: 'Strategy changed' })
  const links = lead.locator('.boundary-links')
  await expect(links).toBeVisible()
  const [line, box] = await Promise.all([lead.boundingBox(), links.boundingBox()])
  expect(box!.x + box!.width).toBeLessThanOrEqual(line!.x + line!.width + 1)

  await links.locator('button').first().click()
  await expect(page.locator('.panel-host[data-panel-kind$="config"] [data-panel="config"]')).toBeVisible()
})

/**
 * Where the code moved, the line carries the whole message of a commit. No stored session has one yet
 * (measured 2026-10-31, over 14 rows), so it is mocked here. The words give way and keep their card,
 * the list is not widened, and the dashes stay beside them: they are the colour's second channel.
 */
test('a long code change stays on its line, its rule drawn and its commits in a card', async ({ page }) => {
  await page.route(`**/api/v1/deployments/${FIXTURE_DEPLOYMENT}`, route => {
    const body = structuredClone(fixture('deployment_detail.json')) as { sessions: Record<string, unknown>[] }
    body.sessions[1]!['code_changes'] = [
      {
        repository_label: 'framework',
        old_commit: '758e39e2a1b2',
        new_commit: '2234e043c3d4',
        commits_between: 3,
        change_direction: 'forward',
        subject: 'Let a deployment say where its sessions ran different code, in a message that fills the line',
      },
      {
        repository_label: 'strategy touch_and_turn',
        old_commit: 'a1b2c3d4e5f6',
        new_commit: '0f9e8d7c6b5a',
        commits_between: 1,
        change_direction: 'back',
        subject: 'Correct a sentence in a guide, in a message long enough to need the room of the first one too',
      },
    ]
    return route.fulfill({ json: body })
  })
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()

  const lead = page.locator('.sessions-list .record-lead', { hasText: 'framework' })
  await expect(lead).toBeVisible()
  const { sideways, rule } = await lead.evaluate(line => ({
    sideways: line.scrollWidth - line.clientWidth,
    rule: parseFloat(getComputedStyle(line, '::before').width),
  }))
  expect(sideways).toBeLessThanOrEqual(1)
  expect(rule, 'long words squeezed the dashed rule away').toBeGreaterThan(8)

  await lead.locator('.boundary-words').first().hover()
  const card = page.locator('.hover-card')
  await expect(card).toContainText('758e39e2a1b2', { timeout: 15_000 })
  await expect(card).toContainText('in a message that fills the line')
})

test('a chosen deployment survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page.locator('.deployment-bundle .chosen-id')).toContainText(FIXTURE_DEPLOYMENT)

  await page.reload()
  await expect(page.locator('.deployment-bundle .chosen-id')).toContainText(FIXTURE_DEPLOYMENT)
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
})

test('a stored deployment the ledger no longer lists says so', async ({ page }) => {
  await openWith(page, '/', { deployment: 'deploy_gone' })
  await showPanel(page, 'Deployment bundle')
  await expect(page.locator('.deployment-bundle')).toContainText('no longer in the ledger')
  await expect(page.locator('.deployment-bundle')).toContainText('deploy_gone')
})

/**
 * The same geometry invariant `list_ranks.spec.ts` holds on the run view, applied here because this
 * is the half of the app it never reached: a figure cell stands under its own heading. The edges
 * compared are the INK's, through a Range, so padding does not enter into it.
 */
test('every figure cell stands under its own heading', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page.locator('.sessions-list .record-row').first()).toBeVisible()
  await page.locator('details').evaluateAll(
    list => list.forEach(element => element.setAttribute('open', ''))
  )

  for (const selector of ['.sessions-list', '.periods-list']) {
    await expectFiguresRightAligned(page, selector)
    await expectHeadingsReadable(page, selector)
  }
})

/**
 * The axis the operator photographed as `2026-020202801000…` — overlapping full timestamps. It
 * draws natural steps now, and the part every mark shares sits once beside the scale's name.
 */
test('the timeline marks round moments rather than overlapping stamps', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 })
  await openLedger(page)
  await page.locator('.deployment-list .record-row', { hasText: FIXTURE_DEPLOYMENT }).click()
  await expect(page.locator('.timeline').first()).toBeVisible()

  const marks = await page.locator('.timeline .tick').allTextContents()
  expect(marks.length).toBeGreaterThan(1)
  // no seconds anywhere, and nothing carrying a full ISO stamp
  for (const mark of marks) {
    expect(mark).not.toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(mark.length).toBeLessThan(12)
  }

  // and they do not overlap, which is the defect the format replaced — on the same line: a label
  // staggered onto the second line may stand under another. Once MEASURED: the first frame lays the
  // marks out by percentages, the way jsdom does, and in a narrow panel those can touch until the
  // axis has its width (read here at a column of 470 px, 2026-10-20).
  await expect(async () => {
    const boxes = await page.locator('.timeline .tick').evaluateAll(
      list => list.map(element => element.getBoundingClientRect())
        .sort((a, b) => a.top - b.top || a.left - b.left)
        .map(box => [Math.round(box.top), box.left, box.right] as const)
    )
    for (let index = 1; index < boxes.length; index += 1) {
      if (boxes[index]![0] !== boxes[index - 1]![0]) continue
      expect(boxes[index]![1], `mark ${index} overlaps the one before it`)
        .toBeGreaterThanOrEqual(boxes[index - 1]![2] - 1)
    }
  }).toPass({ timeout: 3000 })
})
