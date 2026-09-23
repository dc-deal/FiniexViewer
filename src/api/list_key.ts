/**
 * Builds a row identity from the key tuple a list response declares about itself.
 *
 * Reading the declaration rather than hardcoding a field is what lets one component render two
 * routes correctly: run-scoped booking periods are unique by (unit_name, segment_no), while the
 * deployment-scoped ones need run_id as well, because segment_no is a per-bot counter that
 * restarts and two periods of one deployment can both be number 1.
 */
export function rowKey(row: object, key: string[]): string {
  // the cast is contained here: the caller's row is typed, the key tuple is data from the wire
  const fields = row as Record<string, unknown>
  return key.map(field => String(fields[field])).join('|')
}
