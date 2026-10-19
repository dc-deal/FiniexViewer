/** Response type for GET /api/v1/brokers */
export type BrokerList = string[]

/** Single symbol entry from GET /api/v1/brokers/{broker}/symbols */
export interface BrokerSymbol {
  symbol: string
  market_type: string
  /**
   * The instrument's smallest price step, from the broker's configuration (contract 35) — the step a
   * computed price is rounded by for display. `null` where the configuration names no such symbol
   * or cannot be read; the list itself never fails on it.
   */
  tick_size: number | null
}

/** Response type for GET /api/v1/brokers/{broker}/symbols */
export type SymbolList = BrokerSymbol[]
