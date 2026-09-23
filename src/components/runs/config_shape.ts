import type { StrategyConfig } from '@/types/api/report_types'

/**
 * Reading a run configuration without rebuilding the backend's cascade.
 *
 * Two shapes arrive under one route. An autotrader profile carries `strategy_config` at the top;
 * a scenario set carries `global.strategy_config` plus a list of scenarios that may override it.
 * That difference is contained HERE rather than travelling through the components as a union.
 *
 * What this deliberately does NOT do is resolve an override. The cascade belongs to the backend —
 * documented there as 2 levels for `strategy_config` and `stress_test_config`, 3 for
 * `execution_config` and `trade_simulator_config` — and its merge depth is not visible in what we
 * receive. For the 3-level blocks the base layer lives in the backend's own app configuration and
 * is not in this document at all. Computing an effective value would be a second implementation of
 * someone else's rule, drifting silently the moment they change it.
 *
 * That an override EXISTS is readable. What it resolves to is not. So this reports the first.
 */

/** The blocks the backend documents as cascading from global into a scenario. */
const CASCADE_KEYS = [
  'strategy_config',
  'execution_config',
  'trade_simulator_config',
  'stress_test_config',
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** True for a block that carries something — an empty object is an inherited block, not an override. */
function isFilled(value: unknown): boolean {
  const record = asRecord(value)
  return record !== null && Object.keys(record).length > 0
}

/**
 * The strategy at the top of the document: the profile's own on a live run, the scenario set's
 * `global` on a simulation. Null where neither is present — an older document, or a shape we do
 * not know, and then only the tree can speak for it.
 */
export function strategyOf(config: Record<string, unknown>): StrategyConfig | null {
  const direct = asRecord(config['strategy_config'])
  const global = asRecord(asRecord(config['global'])?.['strategy_config'])
  const found = isFilled(direct) ? direct : (isFilled(global) ? global : null)
  if (!found) return null
  return {
    decision_logic_type: String(found['decision_logic_type'] ?? ''),
    decision_logic_config: asRecord(found['decision_logic_config']) ?? {},
    worker_instances: (asRecord(found['worker_instances']) ?? {}) as Record<string, string>,
    workers: (asRecord(found['workers']) ?? {}) as Record<string, Record<string, unknown>>,
  }
}

/** One worker instance, its declared type and the parameters it was given. */
export interface WorkerRow {
  instance: string
  type: string
  parameters: Record<string, unknown>
}

/**
 * The workers as one list. `worker_instances` says which type an instance is and `workers` says
 * what it was tuned with — two maps over the same keys, and a reader shown them apart has to join
 * them by hand. An instance named in either map appears, so neither half can hide the other.
 */
export function workersOf(strategy: StrategyConfig): WorkerRow[] {
  const names = [...new Set([
    ...Object.keys(strategy.worker_instances),
    ...Object.keys(strategy.workers),
  ])]
  return names.map(instance => ({
    instance,
    type: strategy.worker_instances[instance] ?? '',
    parameters: strategy.workers[instance] ?? {},
  }))
}

/** A scenario that carries its own version of at least one cascading block. */
export interface ScenarioOverride {
  name: string
  keys: string[]
}

/**
 * Which scenarios override which blocks. Reads presence only: a non-empty block on a scenario is
 * an override, an empty one is inheritance. What the override resolves to is the backend's answer,
 * not ours.
 */
export function scenarioOverrides(config: Record<string, unknown>): ScenarioOverride[] {
  const scenarios = config['scenarios']
  if (!Array.isArray(scenarios)) return []
  return scenarios.flatMap((entry, index) => {
    const scenario = asRecord(entry)
    if (!scenario) return []
    const keys = CASCADE_KEYS.filter(key => isFilled(scenario[key]))
    if (!keys.length) return []
    return [{ name: String(scenario['name'] ?? `#${index + 1}`), keys }]
  })
}

/** How many scenarios the set declares — the denominator the override count is read against. */
export function scenarioCount(config: Record<string, unknown>): number {
  const scenarios = config['scenarios']
  return Array.isArray(scenarios) ? scenarios.length : 0
}
