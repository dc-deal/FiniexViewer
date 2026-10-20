import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LinkContext, PositionRef } from '@/types/context_types'

/** The link every panel belongs to while there is only one. */
export const MAIN_LINK = 'A'

/**
 * The narrowing after a click on a scenario: that one alone — or, the scenario in focus clicked
 * again, the whole run. ONE scenario in focus (operator, 2026-10-16): a reader works one case at a
 * time, and the run chart, which draws one unit, then shows the same one the lists show. The
 * narrowing stays a list, so several can come back as a modifier click without a new shape.
 */
export function toggledFocus(units: string[], unit: string): string[] {
  return units.length === 1 && units[0] === unit ? [] : [unit]
}

export function emptyLink(): LinkContext {
  return {
    run: { id: null, units: [], position: null },
    deployment: { id: null },
    sweep: { id: null },
    market: { broker: null, symbol: null },
  }
}

/**
 * What the reader is looking at, held per LINK — a set of context keys the panels of one link
 * share. It replaces the URL as the home of the selection: the viewer is single-user and
 * local-first, so the selection is stored locally (`arrangement_store`) and restored on load.
 *
 * Written ONLY through the actions below, and each carries its declared cascade, so a rule like
 * "a new run takes the narrowing and the mark of the old one with it" exists once. A position id is
 * a counter per unit — `pos_eurgbp_1` exists in every run that traded EURGBP — so a mark carried
 * into the next run would mark a DIFFERENT position under the same name. A restore applies stored
 * values as they are, without cascading: a reload is not a new run.
 */
export const useContextStore = defineStore('context', () => {
  const links = ref<Record<string, LinkContext>>({ [MAIN_LINK]: emptyLink() })

  const main = computed(() => links.value[MAIN_LINK]!)

  /**
   * A new run: its narrowing and its mark start empty. This only WRITES the context — a reader
   * choosing a run goes through `useRunsStore().selectRun`, which loads it too. Docked views stay
   * mounted, so a context changed here alone leaves the run's summary behind.
   */
  function selectRun(id: string | null): void {
    main.value.run = { id, units: [], position: null }
  }

  /** The narrowing as a whole. Duplicates are not a selection, and the mark stays where it is. */
  function setUnits(units: string[]): void {
    main.value.run.units = [...new Set(units)]
  }

  /** Puts a scenario in focus, or — the one in focus — shows the whole run again. */
  function toggleUnit(unit: string): void {
    setUnits(toggledFocus(main.value.run.units, unit))
  }

  /** Back to the whole run. */
  function clearUnits(): void {
    setUnits([])
  }

  function mark(position: PositionRef | null): void {
    main.value.run.position = position
  }

  /** Only writes the context — a reader choosing one goes through `useDeploymentsStore().selectDeployment`. */
  function selectDeployment(id: string | null): void {
    main.value.deployment = { id }
  }

  /** Only writes the context — a reader choosing one goes through `useSweepsStore().selectSweep`. */
  function selectSweep(id: string | null): void {
    main.value.sweep = { id }
  }

  /** A broker has its own symbols, so the symbol of the last one is cleared with it. */
  function setBroker(broker: string | null): void {
    main.value.market = { broker, symbol: null }
  }

  function setSymbol(symbol: string | null): void {
    main.value.market.symbol = symbol
  }

  /** Stored links as they are — the main link always exists, whatever was stored. */
  function restore(stored: Record<string, LinkContext>): void {
    links.value = { ...stored, [MAIN_LINK]: stored[MAIN_LINK] ?? emptyLink() }
  }

  return {
    links,
    main,
    selectRun,
    setUnits,
    toggleUnit,
    clearUnits,
    mark,
    selectDeployment,
    selectSweep,
    setBroker,
    setSymbol,
    restore,
  }
})
