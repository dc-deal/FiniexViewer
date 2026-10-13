import type { Page } from '@playwright/test'

/** The stored state of one facet bar — any part left out falls back to the bar's own default. */
interface SeedBar {
  selection?: Record<string, string[]>
  search?: string
  sort?: string
  scope?: string | null
}

/** What a spec may preset: the part of the stored arrangement a reader's last visit leaves. */
export interface Seed {
  run?: string
  units?: string[]
  position?: { scenario: string, position: string }
  deployment?: string
  bars?: Record<string, SeedBar>
}

/**
 * The marker a tab carries once it has been seeded. `cdp_fixture` reads it too, so clearing a
 * shared context and seeding a page come out the same in either order — Playwright leaves the
 * order of context and page init scripts undefined.
 */
export const SEEDED = 'e2e-seeded'

/**
 * The run list showing the fixtures, which it hides by default. The run every capture was taken
 * from is itself a fixture, so a spec that clicks it asks for them — the way a reader would, by
 * picking the value.
 */
export const FIXTURES_SHOWN: Seed = { bars: { 'run-picker': { selection: { purpose: ['fixture'] } } } }

/**
 * Opens `path` on a stored arrangement — what a reader finds who comes back to the app. The
 * selection is not in the URL, so a spec that needs a run open stores it, as the app would have.
 *
 * Written ONCE per tab: an init script runs on every navigation, and seeding again on a reload
 * would overwrite what the page stored meanwhile — the very thing a reload test asserts on. The
 * marker lives in `sessionStorage`, which a reload of the same tab keeps.
 */
export async function openWith(page: Page, path: string, seed: Seed = {}): Promise<void> {
  const arrangement = {
    version: 1,
    links: {
      A: {
        run: { id: seed.run ?? null, units: seed.units ?? [], position: seed.position ?? null },
        deployment: { id: seed.deployment ?? null },
        market: { broker: null, symbol: null },
      },
    },
    bars: seed.bars ?? {},
    chart: { timeframe: null },
  }
  await page.addInitScript(([stored, marker]) => {
    if (sessionStorage.getItem(marker!)) return
    localStorage.setItem('arrangement.v1', stored!)
    sessionStorage.setItem(marker!, '1')
  }, [JSON.stringify(arrangement), SEEDED])
  await page.goto(path)
}

/** The main link as the app stored it — what a reload would find. */
export async function storedLink(page: Page): Promise<{
  run: { id: string | null, units: string[], position: { scenario: string, position: string } | null }
  deployment: { id: string | null }
} | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').links?.A ?? null)
}

/** One bar's stored state, or undefined while nobody has touched it. */
export async function storedBar(page: Page, bar: string): Promise<SeedBar | undefined> {
  return page.evaluate(id => JSON.parse(localStorage.getItem('arrangement.v1') ?? '{}').bars?.[id], bar)
}
