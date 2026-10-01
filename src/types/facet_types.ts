/**
 * What a facet IS, for any list that can be narrowed.
 *
 * The definition is the only place that knows what a row looks like — everything else in the facet
 * machinery works on these functions, which is what lets one bar serve a scenario roster, a run
 * index and a session list without learning any of them.
 */
export interface FacetDefinition<T> {
  id: string
  label: string
  /**
   * The values this row holds for the facet. An empty array means the row STATES NONE, and such a
   * row is matched only while the facet has nothing selected — a row with no value cannot honestly
   * answer a question about that value.
   */
  valuesOf: (row: T) => string[]
}

/** One way to order the list. `compare` is a plain comparator, so a caller can sort by anything. */
export interface SortDefinition<T> {
  id: string
  label: string
  compare: (a: T, b: T) => number
}

/** Which values are picked per facet id. Absent or empty means the facet is not narrowing. */
export type FacetSelection = Record<string, string[]>

/**
 * One choosable value with the number of rows behind it.
 *
 * The count is what would REMAIN if this value were picked, with every OTHER facet's selection
 * still applied — so a count of 0 means picking it leads nowhere, and the reader can see that
 * before clicking rather than after.
 */
export interface FacetOption {
  value: string
  count: number
  active: boolean
}
