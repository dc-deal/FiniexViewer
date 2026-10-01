/**
 * Narrowing and ordering a list — the whole of it, as pure functions over rows the caller already
 * has.
 *
 * Nothing here fetches, derives a category or invents a value: a facet's values come out of the
 * row through the caller's own `valuesOf`, and a row that states none is simply not claimed. That
 * is the difference between arranging what the API said and working something out.
 */
import type { FacetDefinition, FacetOption, FacetSelection, SortDefinition } from '@/types/facet_types'

/** Picked values within one facet are OR; different facets are AND. */
function matchesFacet<T>(row: T, definition: FacetDefinition<T>, picked: string[]): boolean {
  if (!picked.length) return true
  const values = definition.valuesOf(row)
  return values.some(value => picked.includes(value))
}

function matchesSearch<T>(row: T, term: string, searchOf: (row: T) => string): boolean {
  if (!term) return true
  return searchOf(row).toLowerCase().includes(term.toLowerCase())
}

export interface FilterInput<T> {
  rows: T[]
  definitions: FacetDefinition<T>[]
  selection: FacetSelection
  search?: string
  searchOf?: (row: T) => string
}

/** The rows that survive the search and every facet. Order is the caller's; this only removes. */
export function applyFacets<T>(input: FilterInput<T>): T[] {
  const { rows, definitions, selection, search = '', searchOf } = input
  const term = search.trim()
  return rows.filter(row => {
    if (term && searchOf && !matchesSearch(row, term, searchOf)) return false
    return definitions.every(definition =>
      matchesFacet(row, definition, selection[definition.id] ?? []))
  })
}

/**
 * The choosable values of ONE facet, counted against every OTHER facet's selection.
 *
 * Counting against the full selection instead would make every unpicked value read 0 as soon as one
 * value is picked, which is the behaviour that makes a filter feel broken. Excluding the facet's
 * own selection is what lets a reader widen a choice without clearing it first.
 */
export function facetOptions<T>(
  input: FilterInput<T>,
  facetId: string
): FacetOption[] {
  const definition = input.definitions.find(entry => entry.id === facetId)
  if (!definition) return []

  const others = { ...input.selection }
  delete others[facetId]
  const context = applyFacets({ ...input, selection: others })

  const counts = new Map<string, number>()
  for (const row of context) {
    for (const value of definition.valuesOf(row)) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }

  const picked = input.selection[facetId] ?? []
  // a picked value stays listed even where the other facets have left it at zero, so the reader
  // can always take it back off
  for (const value of picked) {
    if (!counts.has(value)) counts.set(value, 0)
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, active: picked.includes(value) }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

/** A copy of the selection with one value switched on or off. Never mutates the input. */
export function toggleValue(
  selection: FacetSelection,
  facetId: string,
  value: string
): FacetSelection {
  const picked = selection[facetId] ?? []
  const next = picked.includes(value)
    ? picked.filter(entry => entry !== value)
    : [...picked, value]
  const result = { ...selection }
  if (next.length) result[facetId] = next
  else delete result[facetId]
  return result
}

export function isNarrowed(selection: FacetSelection, search = ''): boolean {
  if (search.trim()) return true
  return Object.values(selection).some(picked => picked.length > 0)
}

/** Sorted copy. A sort the caller does not know is ignored rather than throwing. */
export function sortRows<T>(rows: T[], sorts: SortDefinition<T>[], sortId: string): T[] {
  const sort = sorts.find(entry => entry.id === sortId)
  if (!sort) return rows
  return [...rows].sort(sort.compare)
}
