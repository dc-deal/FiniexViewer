import { vi } from 'vitest'

/**
 * Widths for a row that puts what does not fit behind a control. jsdom lays nothing out, so every
 * width is 0 and everything fits; this hands them over by class — the row, one width for every
 * item, and the control — which is all the row measures. Undone by `vi.restoreAllMocks()`.
 */
export function stubOverflowWidths(row: number, cell: number, more: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.classList.contains('overflow-row') ? row
      : this.classList.contains('overflow-cell') ? cell
        : this.classList.contains('overflow-more-cell') ? more
          : 0
    return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON: () => ({}) }
  })
}
