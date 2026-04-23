import axios from 'axios'
import type { BrokerList, SymbolList } from '@/types/api/broker_types'
import type { CoverageResponse, ApiBar } from '@/types/api/bar_types'
import type { TimeframeList } from '@/types/api/timeframe_types'

const http = axios.create({
  baseURL: '/api/v1'
})

export async function getTimeframes(): Promise<TimeframeList> {
  const response = await http.get<{ timeframes: TimeframeList }>('/timeframes')
  return response.data.timeframes
}

export async function getBrokers(): Promise<BrokerList> {
  const response = await http.get<{ brokers: BrokerList }>('/brokers')
  return response.data.brokers
}

export async function getSymbols(broker: string): Promise<SymbolList> {
  const response = await http.get<{ symbols: SymbolList }>(`/brokers/${broker}/symbols`)
  return response.data.symbols
}

export async function getCoverage(broker: string, symbol: string): Promise<CoverageResponse> {
  const response = await http.get<CoverageResponse>(`/brokers/${broker}/symbols/${symbol}/coverage`)
  return response.data
}

export async function getBars(
  broker: string,
  symbol: string,
  timeframe: string,
  from: string,
  to: string
): Promise<ApiBar[]> {
  const response = await http.get<ApiBar[]>(
    `/brokers/${broker}/symbols/${symbol}/bars`,
    { params: { timeframe, from, to } }
  )
  return response.data
}
