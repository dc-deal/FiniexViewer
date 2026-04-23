export interface CoverageResponse {
  start: string       // ISO-8601 UTC
  end: string         // ISO-8601 UTC
  timeframes: string[]
}

export interface ApiBar {
  t: number           // unix seconds UTC
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface ChartBar {
  time: number
  open: number
  high: number
  low: number
  close: number
}
