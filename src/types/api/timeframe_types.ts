/** Single timeframe entry from GET /api/v1/timeframes */
export interface TimeframeInfo {
  name: string
  minutes: number
}

/** Response type for GET /api/v1/timeframes */
export type TimeframeList = TimeframeInfo[]
