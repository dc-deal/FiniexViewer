import { describe, it, expect, vi } from 'vitest'
import { PaneLookPrimitive } from '@/components/pane_look'
import type { PaneLook } from '@/types/chart_pane_types'

/**
 * A pane's frame and background, painted by one pane primitive behind everything the pane draws.
 * The canvas is the library's; here it is a context that records what was painted.
 */
function paint(look: PaneLook, ratio = 2) {
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect: vi.fn(), strokeRect: vi.fn(),
  }
  const primitive = new PaneLookPrimitive(look, { background: '#181818', frame: '#4a4a54' })
  const view = primitive.paneViews()[0]!
  const target = {
    useBitmapCoordinateSpace: (draw: (scope: unknown) => void) => draw({
      context, bitmapSize: { width: 400, height: 200 }, horizontalPixelRatio: ratio, verticalPixelRatio: ratio,
    }),
  }
  view.renderer()!.draw(target as never)
  return { context, primitive, view }
}

describe('PaneLookPrimitive', () => {
  it('stands behind everything the pane draws, the same views every time', () => {
    const { primitive, view } = paint({ frame: true })
    expect(view.zOrder!()).toBe('bottom')
    expect(primitive.paneViews()).toBe(primitive.paneViews())
  })

  it('fills the pane with the raised surface where its background is on', () => {
    const { context } = paint({ background: true })
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 400, 200)
    expect(context.fillStyle).toBe('#181818')
    expect(context.strokeRect).not.toHaveBeenCalled()
  })

  /** A whole device pixel, set inside the edge so no half of it falls off the canvas. */
  it('rules the pane’s edge a device pixel wide where its frame is on', () => {
    const { context } = paint({ frame: true }, 2)
    expect(context.strokeRect).toHaveBeenCalledWith(1, 1, 398, 198)
    expect(context.lineWidth).toBe(2)
    expect(context.strokeStyle).toBe('#4a4a54')
    expect(context.fillRect).not.toHaveBeenCalled()
  })
})
