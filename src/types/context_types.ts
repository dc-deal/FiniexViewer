/**
 * One position, named the only way it can be named.
 *
 * `position_id` alone is NOT a position: every scenario counts from `pos_<symbol>_1`, so two
 * scenarios of one symbol both have a `pos_gbpusd_1`. The backend states the pair —
 * *"an executed order-history row's `(scenario_name, position_id)` names the same position as a
 * trade-history row's, by construction"* (testingide, 2026-10-02) — and warns against the id alone.
 */
export interface PositionRef {
  scenario: string
  position: string
}

/** The run a link shows, the scenarios it is narrowed to (empty: the whole run) and the mark. */
export interface RunContext {
  id: string | null
  units: string[]
  position: PositionRef | null
}

export interface DeploymentContext {
  id: string | null
}

/** The market a free chart shows. The timeframe is the chart's own, not the link's. */
export interface MarketContext {
  broker: string | null
  symbol: string | null
}

/**
 * One part of a link a panel can follow or choose: the run, its scenario in focus (`units`), its
 * marked position, the deployment, the market. Ours, so a union — a typo fails the type-check.
 */
export type LinkKey = 'run' | 'units' | 'position' | 'deployment' | 'market'

/**
 * Everything one LINK holds — the selection the panels of that link share. A panel reads its link
 * and writes it only through the context store's actions.
 */
export interface LinkContext {
  run: RunContext
  deployment: DeploymentContext
  market: MarketContext
}
