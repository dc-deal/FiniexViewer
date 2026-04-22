import axios from 'axios'
import type { BrokerList, SymbolList } from '@/types/api/broker_types'

const http = axios.create({
  baseURL: '/api/v1'
})

export async function getBrokers(): Promise<BrokerList> {
  const response = await http.get<{ brokers: BrokerList }>('/brokers')
  return response.data.brokers
}

export async function getSymbols(broker: string): Promise<SymbolList> {
  const response = await http.get<{ symbols: SymbolList }>(`/brokers/${broker}/symbols`)
  return response.data.symbols
}
