import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import { useRunsStore } from '@/stores/runs_store'
import { useRunReportsStore } from '@/stores/run_reports_store'
import type { SectionAbsence } from '@/types/api/absence_types'
import type {
  OrderHistoryReport,
  PortfolioReport,
  RunConfigReport,
  TradeHistoryReport,
  WarningsErrorsReport,
} from '@/types/api/report_types'
import type { ScenarioDetailsReport } from '@/types/api/scenario_types'

const ABSENT: SectionAbsence = { absent: true, cause: 'artifact_not_produced', detail: 'This run does not write that section' }

describe('useRunSectionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** Three responses, one question: what was declared, what it earned, what went wrong. */
  it('composes the roster from the declared, the earned and the failed', () => {
    const reports = useRunReportsStore()
    const roster = { units: [] } as unknown as ScenarioDetailsReport
    const portfolio = { units: [] } as unknown as PortfolioReport
    const failures = { warnings: [], errors: [] } as unknown as WarningsErrorsReport
    reports.scenarios = roster
    reports.portfolio = portfolio
    reports.warningsErrors = failures
    expect(useRunSectionsStore().sources['scenarioRoster'])
      .toEqual({ scenarios: roster, portfolio, warningsErrors: failures })
  })

  /**
   * A composed model built inside one literal was a new object whenever ANY section arrived, and a
   * panel watching it handed the reader's choices back. Apart, it changes only with its own parts.
   */
  it('keeps a composed model the same while an unrelated section arrives', () => {
    const reports = useRunReportsStore()
    reports.orderHistory = { orders: [] } as unknown as OrderHistoryReport
    const sections = useRunSectionsStore()
    const before = sections.sources['orders']
    reports.config = {} as RunConfigReport
    expect(sections.sources['orders']).toBe(before)
    reports.tradeHistory = { trades: [] } as unknown as TradeHistoryReport
    expect(sections.sources['orders']).not.toBe(before)
  })

  it('says which sections are on their way, the summary standing for two', () => {
    useRunReportsStore().loadingTradeHistory = true
    useRunsStore().loadingSummary = true
    const pending = useRunSectionsStore().pending
    expect(pending['tradeHistory']).toBe(true)
    expect(pending['runSummary']).toBe(true)
    expect(pending['feedHealth']).toBe(true)
    expect(pending['broker']).toBe(false)
  })

  it('names every absence with its reason, the summary among them', () => {
    useRunReportsStore().absences = { broker: ABSENT }
    useRunsStore().summaryAbsence = ABSENT
    expect(useRunSectionsStore().absences).toEqual({ broker: ABSENT, runSummary: ABSENT })
  })
})
