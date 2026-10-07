import { expect } from './cdp_fixture'
import type { Page } from '@playwright/test'

/**
 * Geometry a list owes its reader, asserted the same way wherever a list is drawn.
 *
 * Shared because it was duplicated and the two copies DRIFTED. When `Order id` gained a hint on
 * 2026-10-05 the rank sweep's copy was relaxed from "the title equals the label" to "the title
 * begins with it"; the deployments copy was not, and it failed on 2026-10-07 the moment a second
 * column declared a hint. One fix applied twice is the signal; the second time it was applied, it
 * had already been missed once.
 */

/**
 * A HEADING never overprints its neighbour, and its word is always reachable.
 *
 * `.record-head > span` is `white-space: nowrap`; without an overflow rule a heading wider than its
 * column spilled over the one beside it and the two words overprinted. Measured 2026-10-01:
 * `Win rate` took 68 px of a 66 px track at 1920 px on the deployment view. The stem clips them now
 * and carries the whole label in a title, which is what this asserts — the clip makes overprinting
 * impossible, the title makes the clip survivable.
 *
 * Whether a heading truncates at all is deliberately NOT asserted here. Every way of measuring that
 * from script disagreed with the screen: `scrollWidth` counts padding differently once a box clips,
 * and a Range over right-aligned text reports the line box rather than the ink. Two of four
 * "truncated" headings were complete on screen. A column that must stay legible says so with a
 * FLOOR in its own track instead — five of the booking periods carry one for exactly this.
 */
export async function expectHeadingsReadable(page: Page, selector: string): Promise<void> {
  const heads = await page.locator(selector).first().evaluate(shell => {
    const list = shell.querySelector('.record-list')!
    return ([...list.querySelectorAll('.record-head > span')] as HTMLElement[])
      .filter(head => getComputedStyle(head).display !== 'none')
      .map(head => ({
        label: head.textContent?.trim() ?? '',
        title: head.getAttribute('title') ?? '',
        clipped: getComputedStyle(head).overflow !== 'visible',
      }))
  })

  expect(heads.length, `${selector} draws no heading at all`).toBeGreaterThan(0)
  for (const head of heads) {
    /*
     * STARTS WITH the label, rather than equalling it. The title is how a clipped heading can still
     * be read in full, so the label has to come FIRST — but a column may declare a `hint` for a
     * field whose own name misleads, and that follows the label in the same title. `Order id` was
     * the first: the backend's glossary opens its entry with "Not an order's own id".
     */
    expect(head.title.startsWith(head.label),
      `${selector}: the heading "${head.label}" does not lead its own title`).toBe(true)
    expect(head.clipped, `${selector}: the heading "${head.label}" can overprint its neighbour`)
      .toBe(true)
  }
}
