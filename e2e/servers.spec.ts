import { test, expect } from './cdp_fixture'
import { FIXTURE_RUN, mockApi } from './api_mock'
import type { MockServer } from './api_mock'
import { FIXTURES_SHOWN, openWith } from './arrangement_seed'

/**
 * The server switch: what jsdom cannot hold, a real reload, real storage per window, and where a request
 * really goes. A run id means something only on its own system, so the check that matters is that a
 * window's every request goes to its own server.
 */
const DEFAULT: MockServer = {
  id: 'default', name: 'Development', url: 'http://backend:8000', isDefault: true, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: 'h_x29og8',
}
// the captures answer for every server, so its identity is theirs: another would read as a moved address
const SECOND: MockServer = {
  id: 'second', name: 'Second', url: 'http://localhost:8010', isDefault: false, hasToken: true, tunnel: null, tunnelState: 'none', tunnelMessage: null, hostId: 'h_x29og8',
}

test('a window reads the server it chose, and each server keeps its own selection', async ({ page }) => {
  await mockApi(page, { servers: [DEFAULT, SECOND] })
  await page.setViewportSize({ width: 1500, height: 900 })
  await openWith(page, '/', { ...FIXTURES_SHOWN, run: FIXTURE_RUN })
  const name = page.locator('.server-name')
  await expect(name).toHaveText('Development')
  const dockBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').dock)

  const asked: string[] = []
  page.on('request', request => {
    const { pathname } = new URL(request.url())
    if (pathname.includes('/api/v1/')) asked.push(pathname)
  })

  await page.locator('.server-trigger').click()
  await page.locator('[data-server="second"]').click()
  await expect(name).toHaveText('Second')
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  expect(asked.filter(path => !path.startsWith('/server/second/api/v1/'))).toEqual([])

  // the placement came along; the run of the other server did not
  const after = await page.evaluate(() => ({
    main: JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}'),
    own: JSON.parse(localStorage.getItem('arrangement.v1:h_x29og8') ?? 'null'),
  }))
  expect(after.main.links.A.run.id).toBe(FIXTURE_RUN)
  expect(after.main.dock).toEqual(dockBefore)
  if (after.own) expect(after.own.links.A.run.id).toBeNull()

  await page.locator('.server-trigger').click()
  await page.locator('[data-server="default"]').click()
  await expect(name).toHaveText('Development')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').links.A.run.id)
  expect(stored).toBe(FIXTURE_RUN)
})

test('a server with no connection says so, as no connection, and nothing about what runs behind it', async ({ page }) => {
  await mockApi(page, { servers: [DEFAULT, SECOND] })
  await page.route('**/server/second/api/v1/**', route => route.fulfill({
    status: 502, json: { error: 'no_connection', detail: 'ECONNREFUSED' },
  }))
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('server.v1')) sessionStorage.setItem('server.v1', JSON.stringify({ id: 'second', hostId: 'h_x29og8' }))
  })
  await page.goto('/')
  await expect(page.locator('.server-name')).toHaveText('Second')
  await expect(page.locator('.status-bar')).toContainText('no connection')
  await expect(page.getByText('No connection to this server: tunnel or host').first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('status code 502')
})

test('a server is added in the settings, and its token goes out once and is never shown', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.goto('/')
  const sent: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/__viewer/servers')) sent.push(request.postData() ?? '')
  })

  await page.locator('.server-trigger').click()
  await page.locator('[data-action="manage-servers"]').click()
  await page.locator('[data-action="new-server"]').click()
  await page.locator('input[name="server-name"]').fill('Third')
  await page.locator('input[name="server-url"]').fill('http://localhost:8020')
  await page.locator('input[name="server-token"]').fill('a-secret-token')
  await page.locator('.server-detail button[type="submit"]').click()

  await expect(page.locator('.server-row', { hasText: 'Third' })).toBeVisible()
  expect(sent[0]).toContain('a-secret-token')
  await expect(page.locator('input[name="server-token"]')).toHaveValue('')
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
  expect(stored).not.toContain('a-secret-token')
})
