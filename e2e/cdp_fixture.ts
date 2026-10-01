import { lookup } from 'node:dns/promises'
import { test as base, chromium } from '@playwright/test'
import type { Browser, BrowserContext } from '@playwright/test'

/**
 * The browser is not in this container, so we connect to one that is elsewhere.
 *
 * Measured 2026-09-28: the image is Alpine 3.23.4 on musl 1.2.5, and Playwright's browsers are
 * glibc builds — `npx playwright install` here downloads a Chromium that cannot start. The
 * container CAN reach the host (verified: `host.docker.internal:5173` answers), so the cheapest
 * arrangement is a browser the developer already has, driven over CDP.
 *
 * WHAT THIS NEEDS FROM THE OPERATOR, once per session:
 *
 *   chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\finiex-e2e
 *
 * The throwaway profile matters. Attaching to a normal browser would run the tests inside the
 * developer's own session — their cookies, their extensions, their open tabs — and a test that
 * closes a context would close their windows with it.
 *
 * This covers the LOCAL loop only. CI has no such browser, and its answer is a compose service on
 * the official Playwright image; the two are not in competition and share this config.
 *
 * **The endpoint must be an IP, not `host.docker.internal`** — measured 2026-09-28, and it costs an
 * afternoon to work out from the error alone:
 *
 *   http://192.168.65.254:9222/json/version   →  Chrome answers
 *   http://host.docker.internal:9222/…        →  HTTP 500
 *
 * Chrome's DevTools endpoint validates the `Host` header and refuses anything that is not an IP or
 * `localhost`, as a defence against DNS rebinding. The name resolves and the port is open, so
 * every reachability check passes and only the real request fails. The IPv4 lookup is explicit for
 * the second half of the same trap: `host.docker.internal` resolves to an IPv6 address FIRST here,
 * which is unreachable, so the visible error was `ENETUNREACH` on an address nobody chose.
 */
const CDP_HOST = process.env['CDP_HOST'] ?? 'host.docker.internal'
const CDP_PORT = process.env['CDP_PORT'] ?? '9222'

async function cdpEndpoint(): Promise<string> {
  if (process.env['CDP_ENDPOINT']) return process.env['CDP_ENDPOINT']
  // family 4 on purpose — see the note above
  const { address } = await lookup(CDP_HOST, { family: 4 })
  return `http://${address}:${CDP_PORT}`
}

export const test = base.extend<{ context: BrowserContext }, { cdpBrowser: Browser }>({
  /**
   * One connection per worker rather than per test: the handshake is the expensive part, and a
   * browser that is already running does not need starting.
   */
  cdpBrowser: [async ({}, use) => {
    const browser = await chromium.connectOverCDP(await cdpEndpoint())
    await use(browser)
    // disconnect, never close — the browser belongs to the developer, not to the test run
    await browser.close()
  }, { scope: 'worker' }],

  /**
   * A fresh context per test where the browser allows one, so localStorage and the URL start
   * clean — which is exactly what these tests are about. Over CDP a browser may refuse a second
   * context; then its existing one is used and cleared instead, and the tests still hold because
   * each of them sets the state it asserts on.
   */
  context: async ({ cdpBrowser }, use) => {
    let context: BrowserContext
    let ours = false
    try {
      context = await cdpBrowser.newContext()
      ours = true
    } catch {
      context = cdpBrowser.contexts()[0] as BrowserContext
      await context.clearCookies()
    }
    await use(context)
    if (ours) await context.close()
  },
})

export { expect } from '@playwright/test'
