import { test, expect } from './cdp_fixture'
import type { Page } from '@playwright/test'
import { openWith, showPanel, FIXTURES_SHOWN } from './arrangement_seed'

/**
 * The README's pictures, taken anew in one run so they stay current (operator, 2026-10-29): at every
 * release, and whenever a view they show changes visibly. Against the LIVE API — no mock — because
 * the pictures show what a reader meets, and from runs in the archive of FiniexTestingIDE that its
 * fixture catalogue keeps. Kept out of the ordinary run like the performance spec:
 *
 *   PICTURES=1 bash scripts/e2e.sh e2e/readme_pictures.spec.ts --workers=1
 *
 * Each picture is the whole window at 1920 × 1000, the dark theme, every hint put away.
 */

const OUT = '/app/docs/images'
const RUN = '20261007_145935_5f9186f8'
const UNIT = 'EURUSD_blocks_09'
const SESSION = '20261022_123550_0bfde90e'
const DEPLOYMENT = 'deploy_20261012_205734'
// a session of that deployment, so the run chart beside it shows the bot's candles
const DEPLOYMENT_SESSION = '20261012_205836_86534a35'
const SWEEP = 'sweep_20261012_210055'
const HINTS = [
  'scenario-pick', 'quick-bar', 'open-as-panel', 'bundle-commands', 'dock-edges', 'facet-bar', 'activities',
  'deployment-sessions', 'sweeps', 'layers', 'layer-trades', 'layer-entry-exit', 'layer-levels', 'layer-candles',
  'layer-volume', 'layer-empty-levels', 'layer-empty-entry-exit', 'layer-empty-trades', 'chart-marks',
  'trade-slippage', 'position-link',
]

async function prepare(page: Page): Promise<void> {
  await page.addInitScript(banned => {
    window.localStorage.setItem('hints.v1', JSON.stringify({ version: 1, banned }))
  }, HINTS)
  await page.setViewportSize({ width: 1920, height: 1000 })
}

/** Every panel loaded and every chart drawn, the pointer out of the way, and a moment for the last paint. */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.panel-loading')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('[data-panel-kind="run-chart"] .app-spinner')).toHaveCount(0, { timeout: 30_000 })
  await page.mouse.move(5, 995)
  await page.waitForTimeout(800)
}

test('a run as panels beside its run chart and its layers', async ({ page }) => {
  await prepare(page)
  await openWith(page, '/', { run: RUN, units: [UNIT], position: { scenario: UNIT, position: 'pos_eurusd_4' } })
  await page.locator('[data-panel-kind="run-chart"] .candle-chart[data-drawings*="trades:"]').waitFor({ timeout: 30_000 })
  const trades = page.locator('.panel-column .panel-trigger', { hasText: 'Trade history' })
  if ((await trades.getAttribute('aria-expanded')) !== 'true') await trades.click()
  await page.locator('[data-quick-bar="run-chart"] [data-action="layers"]').click()
  await page.locator('[data-panel-kind="layers"] [data-layer="trades"]').waitFor()
  // the chart is the picture's subject: the seam between the report and the chart moves left
  const seam = await page.evaluate(() => {
    const chart = document.querySelector('[data-panel-kind="run-chart"]')!.getBoundingClientRect()
    const sashes = [...document.querySelectorAll('.dv-sash')].map(sash => sash.getBoundingClientRect())
      .filter(box => box.height > 300)
      .sort((a, b) => Math.abs(a.left + a.width / 2 - chart.left) - Math.abs(b.left + b.width / 2 - chart.left))
    return { x: sashes[0]!.left + sashes[0]!.width / 2, y: sashes[0]!.top + sashes[0]!.height / 2 }
  })
  await page.mouse.move(seam.x, seam.y)
  await page.mouse.down()
  await page.mouse.move(seam.x - 380, seam.y, { steps: 12 })
  await page.mouse.up()
  await settled(page)
  await page.screenshot({ path: `${OUT}/run_dock_dark.png` })
})

test('a deployment as its bundle', async ({ page }) => {
  await prepare(page)
  await openWith(page, '/', { run: DEPLOYMENT_SESSION, deployment: DEPLOYMENT })
  await showPanel(page, 'Deployments')
  await showPanel(page, 'Deployment bundle')
  await page.locator('[data-panel-kind="deployment"] .sessions-list .record-row').first().waitFor({ timeout: 30_000 })
  await settled(page)
  await page.screenshot({ path: `${OUT}/deployment_dark.png` })
})

test('a parameter search, ranked', async ({ page }) => {
  await prepare(page)
  await openWith(page, '/', { run: RUN })
  await page.locator('.menu-bar-trigger', { hasText: 'Panels' }).click()
  await page.locator('.menu-item[data-kind="sweeps"]').click()
  await page.keyboard.press('Escape')
  const sweep = page.locator(`[data-panel-kind="sweeps"] .sweep-list .record-group:has([data-sweep="${SWEEP}"])`)
  await sweep.waitFor({ timeout: 30_000 })
  await sweep.click()
  await page.locator('[data-panel-kind="sweeps"] .sweep-list .run-id').first().waitFor()
  await settled(page)
  await page.screenshot({ path: `${OUT}/sweep_ranked_dark.png` })
})

test('a session played over time', async ({ page }) => {
  await prepare(page)
  // the fixture runs shown, so the run list holds the session it is looking at
  await openWith(page, '/', { ...FIXTURES_SHOWN, run: SESSION })
  const section = page.locator('[data-panel-kind="run"] [data-panel="latest-state"]')
  await section.locator('details summary').click()
  await expect(section.locator('.player .where')).toContainText('frame', { timeout: 30_000 })
  await section.locator('[data-action="first"]').click()
  await section.locator('[data-action="on"]').click()
  await settled(page)
  await page.screenshot({ path: `${OUT}/session_frames_dark.png` })
})
