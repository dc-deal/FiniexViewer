import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { LinkContext, PositionRef } from '@/types/context_types'

/** The link every panel belongs to while there is only one. */
export const MAIN_LINK = 'A'

export function emptyLink(): LinkContext {
  return {
    run: { id: null, units: [], position: null },
    deployment: { id: null },
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

  /** A new run: its narrowing and its mark start empty. */
  function selectRun(id: string | null): void {
    main.value.run = { id, units: [], position: null }
  }

  /** The narrowing as a whole. Duplicates are not a selection, and the mark stays where it is. */
  function setUnits(units: string[]): void {
    main.value.run.units = [...new Set(units)]
  }

  /** Adds a scenario to the narrowing, or takes it out again. */
  function toggleUnit(unit: string): void {
    const units = main.value.run.units
    setUnits(units.includes(unit) ? units.filter(name => name !== unit) : [...units, unit])
  }

  /** Back to the whole run. */
  function clearUnits(): void {
    setUnits([])
  }

  function mark(position: PositionRef | null): void {
    main.value.run.position = position
  }

  function selectDeployment(id: string | null): void {
    main.value.deployment = { id }
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
    setBroker,
    setSymbol,
    restore,
  }
})
