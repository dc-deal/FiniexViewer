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
  // asserted against the capture rather than a transcribed value: what this proves is WHERE the
  // block was found, and a re-capture must not turn that into a wrong literal
  it('finds the strategy in an autotrader profile', () => {
    const declared = (LIVE.config as { strategy_config: { decision_logic_type: string } })
      .strategy_config.decision_logic_type
    expect(declared).toBeTruthy()
    expect(strategyOf(LIVE.config)?.decision_logic_type).toBe(declared)
  })

  it('finds it under global in a scenario set', () => {
    const declared = (SIM.config as { global: { strategy_config: { decision_logic_type: string } } })
      .global.strategy_config.decision_logic_type
    expect(declared).toBeTruthy()
    expect(strategyOf(SIM.config)?.decision_logic_type).toBe(declared)
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
    // built rather than captured: whether the run on the server happens to carry an override is
    // not what this asserts
    it('reports none where every scenario inherits', () => {
      const inherited = { scenarios: [{ name: 'a' }, { name: 'b' }] }
      expect(scenarioOverrides(inherited)).toEqual([])
      expect(scenarioCount(inherited)).toBe(2)
    })

    it('counts the scenarios of a real capture', () => {
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
     * The spelling this suite was blind to. Every fixture above writes `name`, while 363 of the
     * 420 scenario objects in the stored archive write `scenario_name` — so the suite stayed green
     * while the panel printed an invented ordinal on every run recorded from 2026-09-29 onward.
     */
    it('reads the name under the spelling the newer artifacts use', () => {
      const config = { scenarios: [{ scenario_name: 'EURGBP_balanced_10', strategy_config: { x: 1 } }] }
      expect(scenarioOverrides(config)).toEqual([
        { name: 'EURGBP_balanced_10', keys: ['strategy_config'] },
      ])
    })

    /** Both spellings are in the archive, split by artifact age, so an older run still reads. */
    it('reads the name an older artifact wrote', () => {
      const config = { scenarios: [{ name: 'ETHUSD_blocks_01', execution_config: { x: 1 } }] }
      expect(scenarioOverrides(config)).toEqual([
        { name: 'ETHUSD_blocks_01', keys: ['execution_config'] },
      ])
    })

    /**
     * Never a counter. A scenario that names itself not at all reads as ABSENT: its drawing
     * position is not its identity, and printing it as one invents a number the document does not
     * keep — the same lesson as the deployment session index.
     */
    it('reports no name rather than inventing one from the drawing position', () => {
      const config = {
        scenarios: [
          { symbol: 'EURUSD', strategy_config: { x: 1 } },
          { symbol: 'GBPUSD', execution_config: { y: 2 } },
        ],
      }
      expect(scenarioOverrides(config)).toEqual([
        { name: null, keys: ['strategy_config'] },
        { name: null, keys: ['execution_config'] },
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
    expect(wrapper.text()).toContain(LIVE.config_snapshot)
    expect(wrapper.find('.config-id').attributes('title')).toBe(LIVE.config_id)
  })

  it('gives the decision logic and its parameters a place of their own', () => {
    const strategy = strategyOf(LIVE.config)!
    const text = mountPanel(LIVE).text()
    expect(text).toContain(strategy.decision_logic_type)
    expect(Object.keys(strategy.decision_logic_config).length).toBeGreaterThan(0)
    expect(text).toContain(Object.keys(strategy.decision_logic_config)[0]!)
  })

  it('shows each worker instance with its type and its tuning on one row', () => {
    const text = mountPanel(LIVE).text()
    expect(text).toContain('rsi_fast')
    expect(text).toContain('CORE/rsi')
  })

  /**
   * On the shared list stem, which is what removed the last bespoke `<table>` from the app. Inert:
   * a configuration is reference material, with nothing to choose and nothing to sort by — so the
   * rows are divs rather than buttons, and a row that looked clickable and was not would be the
   * same defect as a control that looks disabled and works.
   */
  it('draws the workers on the shared list, read-only', () => {
    const wrapper = mountPanel(LIVE)
    const list = wrapper.find('.worker-list')
    expect(list.exists()).toBe(true)
    expect(wrapper.findAll('table')).toHaveLength(0)

    const heads = list.findAll('.record-head > span').map(node => node.text())
    expect(heads).toEqual(['Instance', 'Type', 'Parameters'])
    expect(list.findAll('.record-row').length).toBeGreaterThan(0)
    expect(list.findAll('button')).toHaveLength(0)
  })

  /**
   * A value longer than its column is cut on screen and kept whole in its title. Found by its
   * INSTANCE rather than by position: the row order is the configuration's, not ours.
   */
  it('keeps a long worker type reachable', () => {
    const row = mountPanel(LIVE).findAll('.record-row')
      .find(node => node.text().includes('rsi_fast'))!
    const cells = row.findAll(':scope > span')
    expect(cells[1]?.attributes('title')).toBe('CORE/rsi')
    expect(cells[2]?.attributes('title')).toContain('periods')
  })

  /**
   * The NOTICE carries the finding — that some scenarios ran with something else — and the list is
   * which ones. Folded, because on a run of forty it pushed the configuration this panel exists to
   * show off the screen; a native `<details>`, so the keyboard and a screen reader get it for free.
   */
  it('folds the list of overriding scenarios but keeps the warning in the open', () => {
    const moved: RunConfigReport = {
      ...SIM,
      config: {
        scenarios: [
          { name: 'window_1', strategy_config: { min_confidence: 0.7 } },
          { name: 'window_2', execution_config: { slippage: 2 } },
        ],
      },
    }
    const wrapper = mountPanel(moved)
    expect(wrapper.find('.notice.moved').exists()).toBe(true)

    const disclosure = wrapper.find('details.overrides')
    expect(disclosure.exists()).toBe(true)
    expect(disclosure.attributes('open')).toBeUndefined()
    expect(disclosure.find('summary').text()).toBe('2 scenarios with their own configuration')
    expect(wrapper.findAll('.override-list li')).toHaveLength(2)
  })

  it('stays silent about overrides where there are none', () => {
    const inherited: RunConfigReport = { ...SIM, config: { scenarios: [{ name: 'a' }] } }
    expect(mountPanel(inherited).find('.notice.moved').exists()).toBe(false)
  })

  /**
   * Built, not captured. An earlier version of this asserted that the CAPTURE carried an override
   * — and the next re-capture had none, which is the dependency every other test here has just
   * been moved off. Whether the run on the server happens to override is not what this asserts.
   */
  it('warns where a scenario set does carry one', () => {
    const moved: RunConfigReport = {
      ...SIM,
      config: { scenarios: [{ name: 'window_1', strategy_config: { min_confidence: 0.7 } }] },
    }
    expect(scenarioOverrides(moved.config).length).toBe(1)
    expect(mountPanel(moved).find('.notice.moved').exists()).toBe(true)
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
   * What the reader was actually shown. Measured 2026-10-05 across all 48 stored runs: 21 of the
   * 31 override rows this panel draws carried a fabricated number — `#10` where the response
   * stated `EURGBP_balanced_10` — because only the older spelling was read.
   */
  it('names an overriding scenario under either spelling, and invents nothing for one with no name', () => {
    const wrapper = mountPanel({
      ...SIM,
      config: {
        ...SIM.config,
        scenarios: [
          { scenario_name: 'EURGBP_balanced_10', strategy_config: { min_confidence: 0.7 } },
          { symbol: 'GBPUSD', execution_config: { slippage: 2 } },
        ],
      },
    })
    const rows = wrapper.findAll('.override-list li')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('EURGBP_balanced_10')
    // absent, not the drawing position
    expect(rows[1]?.find('.scenario').text()).toBe('—')
    expect(wrapper.text()).not.toContain('#2')
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
