import { describe, it, expect } from 'vitest'
import { hasArtifact, SECTION_ARTIFACTS } from '@/api/report_artifacts'
import type { RunInfo } from '@/types/api/report_types'

import runsFixture from './fixtures/runs_list.json'

function run(artifacts: string[]): RunInfo {
  return { ...(runsFixture.runs[0] as RunInfo), artifacts }
}

describe('hasArtifact', () => {
  it('answers from the list the run actually persisted', () => {
    const withScenarios = run(['run_summary.json', 'scenario_details.json'])
    expect(hasArtifact(withScenarios, 'scenarios')).toBe(true)
    expect(hasArtifact(withScenarios, 'portfolio')).toBe(false)
  })

  /**
   * The two pipelines write DIFFERENT sets, which is the whole reason this exists. Measured over
   * the captured index: `scenario_details.json` is on 15 of 16 backtests and on 0 of 24 AutoTrader
   * sessions, so asking for it on a session was a 404 and a notice claiming a section was missing.
   */
  it('separates the two pipelines as the captured index does', () => {
    const rows = runsFixture.runs as RunInfo[]
    // a run that wrote NOTHING is the carve-out below, not a pipeline difference — one session in
    // this capture is exactly that, and it must not be read as "this pipeline has no scenarios"
    const wrote = rows.filter(row => row.artifacts.length > 0)
    const sessions = wrote.filter(row => row.group === 'autotrader')
    const simulation = wrote.filter(row => row.group === 'simulation')

    expect(sessions.length).toBeGreaterThan(0)
    expect(sessions.every(row => !hasArtifact(row, 'scenarios'))).toBe(true)
    expect(simulation.some(row => hasArtifact(row, 'scenarios'))).toBe(true)
    // both pipelines write these, so nothing is suppressed that a reader expects
    expect(wrote.every(row => hasArtifact(row, 'portfolio'))).toBe(true)
    expect(wrote.every(row => hasArtifact(row, 'tradeHistory'))).toBe(true)
  })

  /**
   * An empty list means the run wrote nothing at all — logs only, or still going. That case is
   * handled one level up by `has_reports`; reading it here as "no section has its file" would
   * silently suppress the absence notices a half-written run should produce.
   */
  it('does not suppress anything for a run that wrote nothing', () => {
    expect(hasArtifact(run([]), 'scenarios')).toBe(true)
  })

  // A getter added without a map entry must fail loudly with the backend's own 404, never by
  // silently never being requested.
  it('lets an unmapped section through', () => {
    expect(hasArtifact(run(['run_summary.json']), 'somethingNew')).toBe(true)
  })

  /**
   * `config` is the SOURCE configuration rather than an artifact of the run, and `run-summary`
   * gates the whole view — suppressing either would remove a signal the view depends on.
   */
  it('leaves the two load-bearing sections ungated', () => {
    expect(SECTION_ARTIFACTS['config']).toBeUndefined()
    expect(SECTION_ARTIFACTS['runSummary']).toBeUndefined()
  })
})
