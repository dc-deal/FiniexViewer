/** Response type for GET /api/v1/brokers */
export type BrokerList = string[]

/** Single symbol entry from GET /api/v1/brokers/{broker}/symbols */
export interface BrokerSymbol {
  symbol: string
  market_type: string
}

/** Response type for GET /api/v1/brokers/{broker}/symbols */
export type SymbolList = BrokerSymbol[]
