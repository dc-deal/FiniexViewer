import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfigPanel from '@/components/runs/ConfigPanel.vue'
import {
  scenarioCount, scenarioOverrides, strategyOf, workersOf,
} from '@/components/runs/config_shape'
import type { RunConfigReport } from '@/types/api/report_types'

import live from './fixtures/run_config_live.json'
import simulation from './fixtures/run_config_simulation.json'

const LIVE: RunConfigReport = live
const SIM: RunConfigReport = simulation

describe('config_shape', () => {
  // one route, two documents: the profile carries its strategy at the top, the scenario set puts
  // it under `global`. Containing that here is what keeps it out of the components.
  it('finds the strategy in an autotrader profile', () => {
    expect(strategyOf(LIVE.config)?.decision_logic_type).toBe('CORE/simple_consensus')
  })

  it('finds it under global in a scenario set', () => {
    expect(strategyOf(SIM.config)?.decision_logic_type).toContain('backtesting')
  })

  it('answers null where neither shape is present, so the tree can speak instead', () => {
    expect(strategyOf({ something: 'else' })).toBeNull()
  })

  // an EMPTY block is inheritance, not an override — treating it as one would warn about every run
  it('reads an empty block as inheritance rather than as an override', () => {
    expect(strategyOf({ strategy_config: {}, global: { strategy_config: { decision_logic_type: 'X' } } })
      ?.decision_logic_type).toBe('X')
  })

  describe('overrides', () => {
    it('reports none where every scenario inherits', () => {
      expect(scenarioOverrides(SIM.config)).toEqual([])
      expect(scenarioCount(SIM.config)).toBeGreaterThan(0)
    })

    it('names the scenario and the blocks it carries, and nothing more', () => {
      const config = {
        scenarios: [
          { name: 'window_1', strategy_config: {}, execution_config: {} },
          { name: 'window_2', strategy_config: { decision_logic_config: { rsi_oversold: 40 } } },
          { name: 'window_3', execution_config: { slippage: 2 }, trade_simulator_config: { x: 1 } },
        ],
      }
      expect(scenarioOverrides(config)).toEqual([
        { name: 'window_2', keys: ['strategy_config'] },
        { name: 'window_3', keys: ['execution_config', 'trade_simulator_config'] },
      ])
    })

    /**
     * The line this whole panel is drawn on: THAT an override exists is readable, what it resolves
     * to is not. The cascade is the backend's — two levels for strategy, three for execution, and
     * the third of those is not even in this document. Nothing here computes an effective value.
     */
    it('never claims what an override resolves to', () => {
      const config = {
        global: { strategy_config: { decision_logic_config: { rsi_oversold: 35 } } },
        scenarios: [{ name: 'w', strategy_config: { decision_logic_config: { rsi_oversold: 99 } } }],
      }
      // the top block is reported as it stands; 99 never appears as an answer
      expect(strategyOf(config)?.decision_logic_config).toEqual({ rsi_oversold: 35 })
      expect(scenarioOverrides(config)).toEqual([{ name: 'w', keys: ['strategy_config'] }])
    })
  })

  // two maps over the same keys; shown apart, the reader does the join by hand
  it('joins an instance to its type and its parameters', () => {
    const rows = workersOf(strategyOf(LIVE.config)!)
    const rsi = rows.find(row => row.instance === 'rsi_fast')
    expect(rsi?.type).toBe('CORE/rsi')
    expect(rsi?.parameters).toHaveProperty('periods')
  })

  it('keeps an instance that only one of the two maps knows', () => {
    const rows = workersOf({
      decision_logic_type: '', decision_logic_config: {},
      worker_instances: { named_only: 'CORE/x' },
      workers: { tuned_only: { a: 1 } },
    })
    expect(rows.map(row => row.instance).sort()).toEqual(['named_only', 'tuned_only'])
  })
})

describe('ConfigPanel', () => {
  function mountPanel(model: RunConfigReport) {
    return mount(ConfigPanel, { props: { model } })
  }

  it('names the source file and shortens the id, keeping the whole of it reachable', () => {
    const wrapper = mountPanel(LIVE)
    expect(wrapper.text()).toContain('autotrader_config.json')
    expect(wrapper.find('.config-id').attributes('title')).toBe(LIVE.config_id)
  })

  it('gives the decision logic and its parameters a place of their own', () => {
    const text = mountPanel(LIVE).text()
    expect(text).toContain('CORE/simple_consensus')
    expect(text).toContain('rsi_oversold')
  })

  it('shows each worker instance with its type and its tuning on one row', () => {
    const text = mountPanel(LIVE).text()
    expect(text).toContain('rsi_fast')
    expect(text).toContain('CORE/rsi')
  })

  it('stays silent about overrides where there are none', () => {
    expect(mountPanel(SIM).find('.notice.moved').exists()).toBe(false)
  })

  it('warns where scenarios carry their own, and names them', () => {
    const wrapper = mountPanel({
      ...SIM,
      config: {
        ...SIM.config,
        scenarios: [
          { name: 'w1' },
          { name: 'w2', strategy_config: { decision_logic_config: { rsi_oversold: 40 } } },
        ],
      },
    })
    const notice = wrapper.find('.notice.moved')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('⚠')
    expect(wrapper.text()).toContain('w2')
    expect(wrapper.text()).toContain('strategy_config')
  })

  /**
   * The guarantee that makes it safe to highlight anything at all: whatever the named views do not
   * show stays reachable in the tree. Without it, choosing what is important would quietly hide
   * the rest — including a key that does not exist yet.
   */
  it('leaves no top-level key unreachable, in either shape', async () => {
    for (const model of [LIVE, SIM]) {
      const wrapper = mountPanel(model)
      // the tree starts folded; opening the root is the reader's one click
      await wrapper.findAll('.toggle')[0]?.trigger('click')
      const text = wrapper.text()
      for (const key of Object.keys(model.config)) {
        expect(text, `${model.config_snapshot} hides ${key}`).toContain(key)
      }
    }
  })
})
