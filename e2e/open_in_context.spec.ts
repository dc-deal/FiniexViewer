import { test, expect } from './cdp_fixture'
import { mockApi, fixture, FIXTURE_DEPLOYMENT } from './api_mock'
import { openWith, showPanel } from './arrangement_seed'

/**
 * A panel sends the reader into ANOTHER view through one channel, and only a browser proves the
 * shell's half of it.
 *
 * The unit suite records where a panel asked to go; it cannot show that the shell then GOES there,
 * and that the view it lands in restores what it was sent. One test per direction, because each is
 * a different way into a different view: a deployment's session into its run, and a run into the
 * deployment it was a session of.
 */

/** The sessions the captured deployment ran — read from the capture, never transcribed. */
const SESSIONS = (fixture('deployment_detail.json') as { sessions: { run_id: string }[] }).sessions
const FIRST_SESSION = SESSIONS[0]!.run_id

test.beforeEach(async ({ page }) => {
  await mockApi(page)
})

test('a session opens the run it is', async ({ page }) => {
  await openWith(page, '/', { deployment: FIXTURE_DEPLOYMENT })
  await showPanel(page, 'Deployment bundle')
  await page.locator('.sessions-list .jump-link', { hasText: FIRST_SESSION }).click()

  // the run report comes forward, the bundle a pick in the run list opens
  await expect(page.locator('.dv-tab.dv-active-tab .panel-tab')).toHaveAttribute('data-kind', 'run')
  await expect(page.locator('[data-panel-kind="run"] .picker-chosen')).toContainText(FIRST_SESSION)
})

test('a run opens the deployment it was a session of', async ({ page }) => {
  await openWith(page, '/', { run: FIRST_SESSION })
  const header = page.locator('.panel-trigger', { hasText: 'Run header' })
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await page.locator('.jump-link', { hasText: FIXTURE_DEPLOYMENT }).click()

  // its history is the deployment's bundle — the list beside it only marks the pick (viewer#43)
  await expect(page.locator('.dv-tab.dv-active-tab')).toContainText('Deployment bundle')
  await expect(page.locator('[data-panel-kind="deployment"] .chosen-id')).toContainText(FIXTURE_DEPLOYMENT)
})
