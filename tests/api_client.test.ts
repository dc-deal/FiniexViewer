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
  getBookingPeriods,
  getDeployments,
  getDeployment,
  getDeploymentBookingPeriods,
  getRunConfig,
  getTradeHistory,
} from '@/api/api_client'
import { ArtifactUnreadableError } from '@/api/artifact_unreadable_error'
import { RunIdMismatchError } from '@/api/run_id_mismatch_error'
import { SurfaceForbiddenError } from '@/api/surface_forbidden_error'
import { RunNotFoundError } from '@/api/run_not_found_error'

// Captured from the running backend rather than hand-written: a mock built by hand becomes a
// second mirror of the contract, and the two drift apart without anything saying so.
import runBookingPeriodsFixture from './fixtures/run_booking_periods.json'
import deploymentsFixture from './fixtures/deployments_list.json'
import deploymentDetailFixture from './fixtures/deployment_detail.json'
import deploymentPeriodsFixture from './fixtures/deployment_booking_periods.json'
import runConfigFixture from './fixtures/run_config_live.json'
import tradeHistoryFixture from './fixtures/trade_history.json'

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
      const runs = [{ run_id: '20260615_130000', group: 'live', name: 'my_profile', has_reports: true }]
      mockGet.mockResolvedValue({ data: { runs, count: 1 } })
      const result = await getRuns()
      expect(result).toEqual(runs)
      expect(mockGet).toHaveBeenCalledWith('/reports/runs')
    })
  })

  describe('getRunSummary', () => {
    it('calls the run-summary endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: { run_id: '20260615_130000', currencies: [] } })
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
      mockGet.mockResolvedValue({ data: { run_id: '20260615_130000', warnings: [], errors: [], outcome: {} } })
      await getWarningsErrors('20260615_130000')
      expect(mockGet).toHaveBeenCalledWith('/reports/runs/20260615_130000/warnings-errors')
    })

    it('maps 404 to null — a run without the artifact is an absence, not a failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getWarningsErrors('20260615_130000')).toBeNull()
    })

    it('raises a typed error on 409 — the artifact is there but predates the schema', async () => {
      mockGet.mockRejectedValue({
        response: { status: 409, data: { error: 'artifact_unreadable', detail: 'Re-run to regenerate it.' } },
      })
      await expect(getWarningsErrors('20260615_130000'))
        .rejects.toBeInstanceOf(ArtifactUnreadableError)
    })

    it('carries the backend detail as the message — it is the text the user reads', async () => {
      mockGet.mockRejectedValue({
        response: { status: 409, data: { detail: 'Written by an older schema. Re-run to regenerate it.' } },
      })
      await expect(getWarningsErrors('20260615_130000'))
        .rejects.toThrow('Written by an older schema. Re-run to regenerate it.')
    })

    it('rethrows any other failure', async () => {
      mockGet.mockRejectedValue({ response: { status: 500 } })
      await expect(getWarningsErrors('20260615_130000')).rejects.toBeDefined()
    })
  })

  describe('the report body names its own run', () => {
    // a duplicated run_id passes every membership check the client can make; the only thing that
    // catches it is the body saying which run it was built from
    it('raises when the summary belongs to a different run', async () => {
      mockGet.mockResolvedValue({ data: { run_id: '20260615_999999', currencies: [] } })
      await expect(getRunSummary('20260615_130000')).rejects.toBeInstanceOf(RunIdMismatchError)
    })

    it('names both ids, so the mismatch can be traced', async () => {
      mockGet.mockResolvedValue({ data: { run_id: '20260615_999999', warnings: [], errors: [], outcome: {} } })
      await expect(getWarningsErrors('20260615_130000'))
        .rejects.toThrow('Requested run 20260615_130000 but the report belongs to 20260615_999999')
    })

    it('raises on the portfolio too — every section is checked, not just the first', async () => {
      mockGet.mockResolvedValue({ data: { run_id: '20260615_999999', units: [], aggregates: [] } })
      await expect(getPortfolio('20260615_130000')).rejects.toBeInstanceOf(RunIdMismatchError)
    })
  })

  describe('getPortfolio', () => {
    it('calls the portfolio endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: { run_id: '20260615_130000', units: [], aggregates: [] } })
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

  describe('getBookingPeriods', () => {
    it('calls the booking-periods endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: runBookingPeriodsFixture })
      const result = await getBookingPeriods('20260922_134726_7cbebb0c')
      expect(mockGet).toHaveBeenCalledWith(
        '/reports/runs/20260922_134726_7cbebb0c/booking-periods'
      )
      expect(result?.periods.length).toBeGreaterThan(0)
    })

    it('maps 404 to null — every run from before the journal answers that way', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getBookingPeriods('20260615_130000')).toBeNull()
    })

    it('raises a typed error on 409, like every other stored artifact', async () => {
      mockGet.mockRejectedValue({
        response: { status: 409, data: { detail: 'Written by an older schema.' } },
      })
      await expect(getBookingPeriods('20260615_130000'))
        .rejects.toBeInstanceOf(ArtifactUnreadableError)
    })

    it('checks the body names the run that was asked for', async () => {
      mockGet.mockResolvedValue({ data: { ...runBookingPeriodsFixture, run_id: '20260615_999999' } })
      await expect(getBookingPeriods('20260615_130000'))
        .rejects.toBeInstanceOf(RunIdMismatchError)
    })
  })

  describe('deployments', () => {
    it('reads the ledger listing', async () => {
      mockGet.mockResolvedValue({ data: deploymentsFixture })
      const result = await getDeployments()
      expect(mockGet).toHaveBeenCalledWith('/deployments')
      expect(result.deployments.length).toBeGreaterThan(0)
    })

    it('reads one deployment by id', async () => {
      mockGet.mockResolvedValue({ data: deploymentDetailFixture })
      const result = await getDeployment('deploy_20260922_121648')
      expect(mockGet).toHaveBeenCalledWith('/deployments/deploy_20260922_121648')
      expect(result?.sessions.length).toBeGreaterThan(0)
    })

    it('reads every period of every session in one call', async () => {
      mockGet.mockResolvedValue({ data: deploymentPeriodsFixture })
      const result = await getDeploymentBookingPeriods('deploy_20260922_121648')
      expect(mockGet).toHaveBeenCalledWith('/deployments/deploy_20260922_121648/booking-periods')
      expect(result?.periods.length).toBeGreaterThan(0)
    })

    it('maps 404 to null on the detail — an id the ledger lost is an absence', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getDeployment('deploy_gone')).toBeNull()
    })
  })

  // A 403 is a third kind of refusal, next to "no credential" and "no such thing": the token is
  // valid and carries nothing on this surface. Reported as itself, because repeating the request
  // cannot help and "could not load" would send the reader looking in the wrong place.
  describe('a surface the token does not carry', () => {
    it('raises a typed error on the collection route', async () => {
      mockGet.mockRejectedValue({ response: { status: 403, data: { error: 'forbidden' } } })
      await expect(getDeployments()).rejects.toBeInstanceOf(SurfaceForbiddenError)
    })

    it('raises it on the detail route too, not only on the collection', async () => {
      mockGet.mockRejectedValue({ response: { status: 403, data: { error: 'forbidden' } } })
      await expect(getDeployment('deploy_20260922_121648'))
        .rejects.toBeInstanceOf(SurfaceForbiddenError)
    })

    it('names the surface and NOT the grants the backend listed', async () => {
      mockGet.mockRejectedValue({
        response: {
          status: 403,
          data: { detail: "token 'viewer' holds nothing on 'deployments' · holds: bars:*" },
        },
      })
      await expect(getDeployments()).rejects.toThrow(/deployments/)
      await expect(getDeployments()).rejects.not.toThrow(/bars:\*/)
    })
  })

  /**
   * One status, two meanings, and they must not be collapsed. `config_snapshot_missing` is the
   * ordinary absence of a section. `run_not_found` says the backend does not know a run our own
   * index just named — a disagreement between two indexes, which behind a blank panel would look
   * like a run that simply has no configuration.
   */
  describe('getRunConfig', () => {
    it('calls the config endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: runConfigFixture })
      const result = await getRunConfig(runConfigFixture.run_id)
      expect(mockGet).toHaveBeenCalledWith(`/reports/runs/${runConfigFixture.run_id}/config`)
      expect(result?.config_snapshot).toBe('autotrader_config.json')
    })

    it('maps a run older than the config store to null — an absence', async () => {
      mockGet.mockRejectedValue({
        response: { status: 404, data: { error: 'config_snapshot_missing' } },
      })
      expect(await getRunConfig('20260101_000000_aaaaaaaa')).toBeNull()
    })

    it('raises when the backend does not know the run our index named', async () => {
      mockGet.mockRejectedValue({
        response: { status: 404, data: { error: 'run_not_found' } },
      })
      await expect(getRunConfig('20260101_000000_aaaaaaaa'))
        .rejects.toBeInstanceOf(RunNotFoundError)
    })

    // the two are told apart by the BODY, so a 404 without one is treated as the safe case
    it('treats an unlabelled 404 as an absence rather than as a disagreement', async () => {
      mockGet.mockRejectedValue({ response: { status: 404, data: {} } })
      expect(await getRunConfig('20260101_000000_aaaaaaaa')).toBeNull()
    })

    it('checks the body names the run that was asked for', async () => {
      mockGet.mockResolvedValue({ data: { ...runConfigFixture, run_id: '20260615_999999' } })
      await expect(getRunConfig('20260615_130000')).rejects.toBeInstanceOf(RunIdMismatchError)
    })
  })

  describe('getTradeHistory', () => {
    it('calls the trade-history endpoint with the run id in the path', async () => {
      mockGet.mockResolvedValue({ data: tradeHistoryFixture })
      const result = await getTradeHistory(tradeHistoryFixture.run_id)
      expect(mockGet).toHaveBeenCalledWith(
        `/reports/runs/${tradeHistoryFixture.run_id}/trade-history`
      )
      expect(result?.trades.length).toBeGreaterThan(0)
    })

    it('maps 404 to null — a run that closed no position carries no section', async () => {
      mockGet.mockRejectedValue({ response: { status: 404 } })
      expect(await getTradeHistory('20260615_130000')).toBeNull()
    })

    it('checks the body names the run that was asked for', async () => {
      mockGet.mockResolvedValue({ data: { ...tradeHistoryFixture, run_id: '20260615_999999' } })
      await expect(getTradeHistory('20260615_130000')).rejects.toBeInstanceOf(RunIdMismatchError)
    })
  })
})
