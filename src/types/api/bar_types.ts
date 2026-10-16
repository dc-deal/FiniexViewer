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

/**
 * One answer of the bars route: the rows, and whether the range held more than the route's cap.
 * The cap never cuts quietly — a range past it is answered with the cap's worth and says so in
 * `X-Bar-Truncated` (their `market-data` document), so a shortened answer is never taken for whole.
 */
export interface BarAnswer {
  bars: ApiBar[]
  truncated: boolean
}

export interface ChartBar {
  time: number
  open: number
  high: number
  low: number
  close: number
}
