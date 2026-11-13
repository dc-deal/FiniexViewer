import type { IPanePrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, Time } from 'lightweight-charts'
import type { PaneLook } from '@/types/chart_pane_types'

/** The canvas target the library hands a renderer — taken from its own signature, not a second import. */
type CanvasTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

/** What a pane's look is painted with, read from the theme by the chart that owns it. */
export interface PaneLookColours {
  /** The raised surface a pane's background takes. */
  background: string
  /** The rule a pane's frame is drawn in. */
  frame: string
}

/**
 * A pane's frame and background (viewer#57), as the reader set them: a raised surface behind
 * everything the pane draws, and a one-pixel rule along its edges — one pane primitive each, in the
 * library's `bottom` stage, so the candles, the volume and a worker's series all stand over it.
 */
export class PaneLookPrimitive implements IPanePrimitive<Time> {
  // the library caches by the array it is handed, so the same one is handed every time
  private readonly _views: readonly IPrimitivePaneView[]

  constructor(private readonly _look: PaneLook, private readonly _colours: PaneLookColours) {
    const renderer: IPrimitivePaneRenderer = { draw: target => this._draw(target) }
    this._views = [{ zOrder: () => 'bottom', renderer: () => renderer }]
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._views
  }

  private _draw(target: CanvasTarget): void {
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
      if (this._look.background) {
        context.fillStyle = this._colours.background
        context.fillRect(0, 0, bitmapSize.width, bitmapSize.height)
      }
      if (this._look.frame) {
        // a whole device pixel, set inside the edge so no half of it falls off the canvas
        const width = Math.max(1, Math.round(horizontalPixelRatio))
        context.strokeStyle = this._colours.frame
        context.lineWidth = width
        context.strokeRect(width / 2, width / 2, bitmapSize.width - width, bitmapSize.height - width)
      }
    })
  }
}
