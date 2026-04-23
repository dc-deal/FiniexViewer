import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockGet is initialized before the hoisted vi.mock factory runs
const mockGet = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: mockGet })),
  },
}))

import { getTimeframes, getBrokers, getSymbols, getCoverage, getBars } from '@/api/api_client'

describe('api_client', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  describe('getTimeframes', () => {
    it('calls /timeframes and returns timeframe list', async () => {
      mockGet.mockResolvedValue({ data: { timeframes: ['M1', 'M5', 'H1', 'D1'] } })
      const result = await getTimeframes()
      expect(result).toEqual(['M1', 'M5', 'H1', 'D1'])
      expect(mockGet).toHaveBeenCalledWith('/timeframes')
    })
  })

  describe('getBrokers', () => {
    it('calls /brokers and returns broker list', async () => {
      mockGet.mockResolvedValue({ data: { brokers: ['kraken_spot', 'mt5'] } })
      const result = await getBrokers()
      expect(result).toEqual(['kraken_spot', 'mt5'])
      expect(mockGet).toHaveBeenCalledWith('/brokers')
    })
  })

  describe('getSymbols', () => {
    it('calls correct endpoint with broker in path', async () => {
      mockGet.mockResolvedValue({ data: { symbols: [] } })
      await getSymbols('kraken_spot')
      expect(mockGet).toHaveBeenCalledWith('/brokers/kraken_spot/symbols')
    })

    it('returns the symbol list from response', async () => {
      const symbols = [{ symbol: 'BTCUSD', market_type: 'crypto' }]
      mockGet.mockResolvedValue({ data: { symbols } })
      const result = await getSymbols('kraken_spot')
      expect(result).toEqual(symbols)
    })
  })

  describe('getCoverage', () => {
    it('calls correct endpoint and returns coverage response', async () => {
      const coverage = { start: '2024-01-01', end: '2024-12-31', timeframes: ['H1', 'M30'] }
      mockGet.mockResolvedValue({ data: coverage })
      const result = await getCoverage('kraken_spot', 'BTCUSD')
      expect(result).toEqual(coverage)
      expect(mockGet).toHaveBeenCalledWith('/brokers/kraken_spot/symbols/BTCUSD/coverage')
    })
  })

  describe('getBars', () => {
    it('calls correct endpoint with all query params', async () => {
      mockGet.mockResolvedValue({ data: [] })
      await getBars('kraken_spot', 'BTCUSD', 'H1', '2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z')
      expect(mockGet).toHaveBeenCalledWith(
        '/brokers/kraken_spot/symbols/BTCUSD/bars',
        { params: { timeframe: 'H1', from: '2024-01-01T00:00:00Z', to: '2024-12-31T00:00:00Z' } },
      )
    })

    it('returns the bar array from response', async () => {
      const bars = [{ t: 1704067200, o: 42000, h: 43000, l: 41000, c: 42500, v: 100 }]
      mockGet.mockResolvedValue({ data: bars })
      const result = await getBars('kraken_spot', 'BTCUSD', 'H1', '2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z')
      expect(result).toEqual(bars)
    })
  })
})
