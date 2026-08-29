import type { LocationQuery } from 'vue-router'

/**
 * Current query as plain strings. Array-valued and null params are dropped — no view uses them,
 * and carrying them through a merge would change their type on the way back out.
 */
export function readQuery(query: LocationQuery): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

/**
 * Writes one param into a query object, removing it when the value is null. Mutates in place —
 * callers start from readQuery so params owned by other views survive the write.
 */
export function writeParam(query: Record<string, string>, key: string, value: string | null): void {
  if (value === null) {
    delete query[key]
    return
  }
  query[key] = value
}
