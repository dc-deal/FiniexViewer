import type { Locator } from '@playwright/test'

/**
 * The chart library lays its panes out as the rows of a table, top to bottom: a pane is a row of
 * three cells — its left scale, the plot, its right scale — a seam between two panes a row of one,
 * and the time axis the last row. A canvas cannot be read back; these rows can.
 */

/** The panes of a chart, top to bottom: the price pane first. */
export function paneRows(chart: Locator): Locator {
  return chart.locator('.candle-canvas table tr:not(:last-child):has(> td:nth-child(3))')
}

/** The seam between the first pane and the one below it — the handle the library drags it by. */
export function paneSeam(chart: Locator): Locator {
  return chart.locator('.candle-canvas table tr:has(> td[colspan="3"])').first()
}

/** Each pane's height in pixels, top to bottom. */
export function paneHeights(chart: Locator): Promise<number[]> {
  return paneRows(chart).evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))
}

/** The share of the panes' height the lowest one takes. */
export async function lowestShare(chart: Locator): Promise<number> {
  const heights = await paneHeights(chart)
  return heights.at(-1)! / heights.reduce((sum, height) => sum + height, 0)
}

/**
 * How many pixels of a pane's right scale carry ink — a label, a mark — read off its canvases: a
 * pixel of another colour than the scale's ground, the border along its left edge left out. Nothing
 * drawn there reads 0; a canvas cannot be asserted on otherwise.
 */
export function axisInk(chart: Locator, pane: number): Promise<number> {
  return paneRows(chart).nth(pane).evaluate(row => {
    const cell = row.children[2]!
    let ink = 0
    for (const canvas of cell.querySelectorAll('canvas')) {
      const context = canvas.getContext('2d')
      if (!context || !canvas.width || !canvas.height) continue
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
      // the ground: the far corner, where no label stands
      const at = ((height - 1) * width + width - 1) * 4
      const ground = [data[at]!, data[at + 1]!, data[at + 2]!, data[at + 3]!]
      const border = Math.ceil(window.devicePixelRatio * 2)
      for (let y = 0; y < height; y++) {
        for (let x = border; x < width; x++) {
          const index = (y * width + x) * 4
          if (ground.some((value, channel) => Math.abs(data[index + channel]! - value) > 8)) ink++
        }
      }
    }
    return ink
  })
}
