import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { showPanel, FIXTURES_SHOWN, SEEDED } from './arrangement_seed'

/**
 * The README's pictures, taken anew in one run so they stay current: at every release, and
 * whenever a view they show changes visibly. Against the LIVE API — no mock — because the pictures
 * show what a reader meets, and from runs in the archive of FiniexTestingIDE that its fixture
 * catalogue keeps. Kept out of the ordinary run like the performance spec:
 *
 *   PICTURES=1 PICTURES_HIDE=<words> bash scripts/e2e.sh e2e/readme_pictures.spec.ts --workers=1
 *
 * Every picture is taken in ONE arrangement, `readme_arrangement.json` — three columns, every
 * bundle closed and its members standing as panels of their own — laid out 1920 wide in its own
 * proportions, the dark theme, every hint put away: the whole window once, then cut-outs of the
 * panels a highlight is about, with their tabs in front.
 *
 * Nothing private reaches a picture. The lists are narrowed to public runs — the deployments to the
 * demo bot, the run list by a search — and `PICTURES_HIDE`, a comma list of words given at the call
 * and kept out of this repository, stops a picture before it is taken wherever one of them stands in
 * the window's text: a name that slips in fails the run instead of reaching the README.
 */

const OUT = '/app/docs/images'
const RUN = '20261007_145935_5f9186f8'
const UNIT = 'EURUSD_blocks_09'
const SESSION = '20261022_123550_0bfde90e'
const DEPLOYMENT = 'deploy_20261012_205734'
// a session of that deployment, so the panels beside it show the bot's run
const DEPLOYMENT_SESSION = '20261012_205836_86534a35'
const SWEEP = 'sweep_20261012_210055'
// the arrangement the pictures are taken in, stored with the size it was arranged at
const ARRANGEMENT = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'readme_arrangement.json'), 'utf-8'))
const HIDDEN = (process.env['PICTURES_HIDE'] ?? '').split(',').map(word => word.trim().toLowerCase()).filter(Boolean)
const HINTS = [
  'scenario-pick', 'quick-bar', 'open-as-panel', 'bundle-commands', 'dock-edges', 'facet-bar', 'activities',
  'deployment-sessions', 'sweeps', 'layers', 'layer-trades', 'layer-entry-exit', 'layer-levels', 'layer-candles',
  'layer-volume', 'layer-state-frame', 'layer-empty-levels', 'layer-empty-entry-exit', 'layer-empty-trades',
  'layer-empty-state-frame', 'chart-marks',
  'trade-slippage', 'position-link', 'beyond-the-venue', 'first-start', 'run-membership',
]

async function prepare(page: Page): Promise<void> {
  await page.addInitScript(banned => {
    window.localStorage.setItem('hints.v1', JSON.stringify({ version: 1, banned }))
  }, HINTS)
  await page.setViewportSize({ width: 1920, height: 1000 })
}

/** The deployment list narrowed to the demo bot, the run list to what a search finds. */
function narrowed(search: string): Record<string, { selection?: Record<string, string[]>, search?: string }> {
  return { 'deployment-picker': { selection: { bot: ['demo_btcusd_bot'] } }, runs: { search } }
}

interface GridNode { size?: number, data: GridNode[] | object }

/** The grid with every size multiplied by `factor` — the dock gives a gain to its last panels alone. */
function scaled(node: GridNode, factor: number): GridNode {
  const data = Array.isArray(node.data) ? node.data.map(child => scaled(child, factor)) : node.data
  return node.size === undefined ? { ...node, data } : { ...node, data, size: node.size * factor }
}

/** The grid with its columns at `widths`, in the arrangement's own units. */
function withColumns(root: GridNode, widths: number[]): GridNode {
  return { ...root, data: (root.data as GridNode[]).map((column, i) => ({ ...column, size: widths[i] })) }
}

/**
 * Opens the app on the stored arrangement with `link` as its selection, the dock 1920 wide and as
 * tall as the arrangement's proportions ask: every panel keeps its share, each with more room. The
 * first load measures the menu bar; the second lays the dock out at its final size from the start.
 * `columns` gives the columns other widths, for a cut-out that reads better than the whole window
 * lets it.
 */
async function arranged(page: Page, link: object, bars: ReturnType<typeof narrowed>, columns?: number[]): Promise<void> {
  const { width, height } = ARRANGEMENT.dock.grid
  const root = columns ? withColumns(ARRANGEMENT.dock.grid.root, columns) : ARRANGEMENT.dock.grid.root
  const factor = 1920 / width
  const grid = { ...ARRANGEMENT.dock.grid, root: scaled(root, factor), width: 1920, height: Math.round(height * factor) }
  const stored = {
    ...ARRANGEMENT, links: { A: { ...ARRANGEMENT.links.A, ...link } }, bars, dock: { ...ARRANGEMENT.dock, grid },
  }
  await page.addInitScript(([text, marker]) => {
    if (sessionStorage.getItem(marker!)) return
    localStorage.setItem('arrangement.v1', text!)
    sessionStorage.setItem('arrangement.v1', text!)
    sessionStorage.setItem(marker!, '1')
  }, [JSON.stringify(stored), SEEDED])
  await page.goto('/')
  const dock = await page.locator('.dv-dockview').first().boundingBox()
  await page.setViewportSize({ width: 1920, height: Math.round(1000 - dock!.height) + grid.height })
  await page.evaluate(marker => sessionStorage.removeItem(marker), SEEDED)
  await page.reload()
}

/** Every panel loaded and every chart drawn, the pointer out of the way, and a moment for the last paint. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.panel-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('[data-panel-kind="run-chart"] .app-spinner')).toHaveCount(0, { timeout: 30_000 })
  await page.mouse.move(5, 995)
  await page.waitForTimeout(800)
}

/** Stops the run where a hidden word stands anywhere in the window's text. */
async function guard(page: Page, name: string): Promise<void> {
  const text = (await page.locator('body').innerText()).toLowerCase()
  for (const word of HIDDEN) expect(text.includes(word), `a hidden word stands in ${name}`).toBe(false)
}

/** The whole window. */
async function shoot(page: Page, name: string): Promise<void> {
  await guard(page, name)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

/** A cut-out: the dock group whose tabs hold `kind`, its tabs included. */
async function cut(page: Page, name: string, kind: string): Promise<void> {
  await guard(page, name)
  const clip = await page.evaluate(id => {
    const box = document.querySelector(`.panel-tab[data-kind="${id}"]`)!.closest('.dv-groupview')!.getBoundingClientRect()
    return { x: box.left, y: box.top, width: box.width, height: box.height }
  }, kind)
  await page.screenshot({ path: `${OUT}/${name}.png`, clip })
}

test('the workspace', async ({ page }) => {
  await prepare(page)
  await arranged(page, {
    run: { id: RUN, units: [UNIT], position: { scenario: UNIT, position: 'pos_eurusd_4' } },
  }, narrowed('tunnel_swing'))
  await page.locator('[data-panel-kind="run-chart"] .candle-chart[data-drawings*="trades:"]').waitFor({ timeout: 30_000 })
  await settled(page)
  await shoot(page, 'workspace_dark')
})

test('a deployment across its sessions', async ({ page }) => {
  await prepare(page)
  await arranged(page, {
    run: { id: DEPLOYMENT_SESSION, units: [], position: null }, deployment: { id: DEPLOYMENT },
  }, narrowed('tunnel_swing'))
  await showPanel(page, 'Deployment sessions')
  await page.locator('[data-panel-kind="deployment-sessions"] .record-row').first().waitFor({ timeout: 30_000 })
  await settled(page)
  await cut(page, 'deployment_dark', 'deployment-sessions')
})

test('a parameter search, ranked', async ({ page }) => {
  await prepare(page)
  // the left column at 914 px: at the whole window's 700 the win rate and the profit factor give way
  await arranged(page, { run: { id: RUN, units: [], position: null }, sweep: { id: SWEEP } }, narrowed('tunnel_swing'), [632, 405, 290])
  await showPanel(page, 'Sweeps')
  await page.locator('[data-panel-kind="sweeps"] .sweep-list .run-id').first().waitFor({ timeout: 30_000 })
  await settled(page)
  await cut(page, 'sweep_ranked_dark', 'sweeps')
})

test('a session played over time', async ({ page }) => {
  await prepare(page)
  // the fixture runs shown, so the run list holds the session it is looking at
  await arranged(page, { run: { id: SESSION, units: [], position: null } }, {
    ...narrowed('state_frames'), runs: { ...FIXTURES_SHOWN.bars!['runs'], search: 'state_frames' },
  })
  // the run bundle is closed in this arrangement: the Panels menu opens it, beside the lists
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-sub-trigger[data-area="runs"]').click()
  await page.locator('.menu-toggle[data-kind="run"]').click()
  await page.keyboard.press('Escape')
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await section.locator('details summary').click()
  await expect(section.locator('.player .where')).toContainText('frame', { timeout: 30_000 })
  await section.locator('[data-action="first"]').click()
  await section.locator('[data-action="on"]').click()
  await settled(page)
  await cut(page, 'session_frames_dark', 'run')
})
