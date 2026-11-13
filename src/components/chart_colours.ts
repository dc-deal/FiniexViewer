/** A token's hex colour at a share of its strength — the chart library takes a colour, not a CSS mix. */
export function withAlpha(colour: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)
  // at full strength the token as it is
  if (!hex || alpha >= 1) return colour
  const value = Number.parseInt(hex[1]!, 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}
