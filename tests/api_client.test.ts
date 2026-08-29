import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockGet is initialized before the hoisted vi.mock factory runs
const mockGet = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: mockGet })),
    isAxiosError: (error: unknown): boolean =>
      typeof error === 'object' && error !== null && 'response' in error,
  },
}))

import {
  getTimeframes,
  getBrokers,
  getSymbols,
  getCoverage,
  getBars,
  getRuns,
  getRunSummary,
  getWarningsErrors,
  getPortfolio,
} from '@/api/api_client'

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

  describe('getRuns', () => {
    it('calls /reports/runs and returns the run list', async () => {
      const runs = [{ run_id: '20260615_130000', group: 'autotrader', name: 'my_profile' }]
      mockGet.mockResolvedValue({ data: { runs, count: 1 } })
      const result = await getRuns()
      expect(result).toEqual(runs)
      expect(mockGet).toHaveBeenCalledWith('/reports/runs')
    })
  })

  describe('getRunSummary', () => {
    it('calls the run-summary endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: { currencies: [] } })
      await getRunSummary('20260615_130000')
      expect(mockGet).toHaveBeenCalledWith('/reports/runs/20260615_130000/run-summary')
    })

    it('maps 404 to null — a run without the artifact is an absence, not a failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      const result = await getRunSummary('20260615_130000')
      expect(result).toBeNull()
    })

    it('rethrows any other failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 500 } })
      await expect(getRunSummary('20260615_130000')).rejects.toBeDefined()
    })
  })

  describe('getWarningsErrors', () => {
    it('calls the warnings-errors endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: { warnings: [], errors: [], outcome: {} } })
      await getWarningsErrors('20260615_130000')
      expect(mockGet).toHaveBeenCalledWith('/reports/runs/20260615_130000/warnings-errors')
    })

    it('maps 404 to null — a run without the artifact is an absence, not a failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getWarningsErrors('20260615_130000')).toBeNull()
    })

    it('rethrows any other failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 500 } })
      await expect(getWarningsErrors('20260615_130000')).rejects.toBeDefined()
    })
  })

  describe('getPortfolio', () => {
    it('calls the portfolio endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: { units: [], aggregates: [] } })
      await getPortfolio('20260615_130000')
      expect(mockGet).toHaveBeenCalledWith('/reports/runs/20260615_130000/portfolio')
    })

    it('maps 404 to null — a run without the artifact is an absence, not a failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getPortfolio('20260615_130000')).toBeNull()
    })

    it('rethrows any other failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 500 } })
      await expect(getPortfolio('20260615_130000')).rejects.toBeDefined()
    })
  })
})
