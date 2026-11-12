import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Settles a bar's entries by RANK: every entry long, then the lowest rank short first, for as long
 * as the bar is short of room — read again after every step, so it stops the moment the rest fits.
 *
 * @param ranks the bar's ranks, ascending; one rank may hold several entries
 * @param shorten puts the entries of one rank into their short form, or back into their long one
 * @param pressed whether the bar is short of room as it stands now
 * @returns the ranks left short
 */
export function settleRanks(
  ranks: readonly number[], shorten: (rank: number, short: boolean) => void, pressed: () => boolean,
): number[] {
  for (const rank of ranks) shorten(rank, false)
  const short: number[] = []
  for (const rank of ranks) {
    if (!pressed()) break
    shorten(rank, true)
    short.push(rank)
  }
  return short
}

/**
 * A bar of the frame that gives room by rank, measured on the bar itself — never at fixed widths,
 * so a long server name, a long scenario name or a warning that appears count as they are (operator,
 * 2026-11-10). An entry carries `data-rank`, and short of room the bar sets `data-short` on it; what
 * the short form looks like is the entry's own, through `.bar-word` and `.bar-icon` (`bar.css`).
 *
 * Short of room means the bar's content is wider than the bar, or a name marked `data-shortens` is
 * cut: such a name shortens before anything beside it, and a word that has an icon gives way first.
 *
 * Settled once a frame, on a change of the bar's size and on a change of its texts. The writes
 * are attributes, which the watch on the texts does not see, so a settle never sets off the next.
 */
export function useRankedBar(bar: Ref<HTMLElement | null>): void {
  let frame = 0
  let sized: ResizeObserver | null = null
  let texts: MutationObserver | null = null

  function entries(): HTMLElement[] {
    return [...(bar.value?.querySelectorAll<HTMLElement>('[data-rank]') ?? [])]
  }

  function pressed(): boolean {
    const element = bar.value
    if (!element) return false
    if (element.scrollWidth > element.clientWidth + 0.5) return true
    return [...element.querySelectorAll<HTMLElement>('[data-shortens]')]
      .some(name => name.scrollWidth > name.clientWidth + 0.5)
  }

  function settle(): void {
    frame = 0
    const list = entries()
    const ranks = [...new Set(list.map(entry => Number(entry.dataset.rank)))].sort((a, b) => a - b)
    settleRanks(ranks, (rank, short) => {
      for (const entry of list) if (Number(entry.dataset.rank) === rank) entry.toggleAttribute('data-short', short)
    }, pressed)
  }

  function schedule(): void {
    if (!frame) frame = requestAnimationFrame(settle)
  }

  onMounted(() => {
    if (!bar.value) return
    sized = new ResizeObserver(schedule)
    sized.observe(bar.value)
    texts = new MutationObserver(schedule)
    texts.observe(bar.value, { childList: true, subtree: true, characterData: true })
    schedule()
  })

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    sized?.disconnect()
    texts?.disconnect()
  })
}
