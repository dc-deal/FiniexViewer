import axios from 'axios'
import type { BrokerList } from '@/types/api/broker_types'

const http = axios.create({
  baseURL: '/api/v1'
})

export async function getBrokers(): Promise<BrokerList> {
  const response = await http.get<BrokerList>('/brokers')
  return response.data
}
