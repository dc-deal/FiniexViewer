/**
 * Failure text for the UI: says what failed, keeps the detail, never shows a stack trace. One copy
 * for every store.
 *
 * @param error What the request threw.
 * @param action What was being done, already translated: `t('Could not load the run index')`.
 */
export function describeFailure(error: unknown, action: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `${action}: ${detail}`
}
