import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Router } from 'vue-router'
import DeploymentPicker from '@/components/deployments/DeploymentPicker.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useDeploymentsStore } from '@/stores/deployments_store'
import type { DeploymentRow } from '@/types/api/deployment_types'
import type { Figure } from '@/types/figure_types'

/**
 * A router, because the bar's narrowing rides in the URL — `useFacetQuery` reads the query on mount
 * and writes it back. MEMORY history, not hash: every hash router in jsdom shares one
 * `window.location`, so each test would inherit the previous one's narrowing.
 */
function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  })
}

const BASE: DeploymentRow = {
  deployment_id: 'deploy_20260927_132812',
  bot: 'demo_btcusd_bot',
  bot_id: 'demo-btc',
  sessions: 1,
  first_started: '2026-09-27T13:28:12.700239Z',
  last_started: '2026-09-27T13:28:12.700239Z',
  currency: 'USD',
  net_pnl: -107.407375,
  max_drawdown: 597.3631312500002,
  max_drawdown_pct: 5.969935821483836,
  // null where no idle stretch EXISTS — one session has nothing between its sessions
  longest_gap_hours: null,
  changed: false,
  // the DISTINCT values of its sessions (contract 23): one entry is a deployment that stayed on
  // one side, both would be a rehearsal mixed with real money and `changed` by itself
  orders_to: ['simulated'],
}

function deployment(overrides: Partial<DeploymentRow> = {}): DeploymentRow {
  return { ...BASE, ...overrides }
}

/**
 * Seeds the store the way a loaded ledger would, INCLUDING the declared key — which is the point of
 * the store keeping it. A picker that hardcoded (deployment_id) would pass every test here except
 * the two-currency one.
 */
function mountPicker(rows: DeploymentRow[], key = ['deployment_id', 'currency']) {
  const store = useDeploymentsStore()
  store.deployments = rows
  store.deploymentsKey = key
  return mount(DeploymentPicker, {
    attachTo: document.body,
    global: { plugins: [testRouter()] },
  })
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.record-row')
}

function cardDetails(wrapper: VueWrapper, index = 0): Figure[] {
  return wrapper.findAllComponents(HoverCard)[index]?.props('details') ?? []
}

function cardRows(wrapper: VueWrapper, index = 0): Record<string, string> {
  return Object.fromEntries(cardDetails(wrapper, index).map(row => [row.label, row.value]))
}

describe('DeploymentPicker', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /**
   * The select this replaces showed two of the twelve fields a ledger row carries, and the other
   * ten only appeared once something had been chosen. A reader choosing a deployment is choosing
   * between its histories.
   */
  it('puts what a deployment DID on the row, not behind the choice', () => {
    const shown = rows(mountPicker([deployment()]))[0]!.text()
    expect(shown).toContain('demo_btcusd_bot')
    expect(shown).toContain('deploy_20260927_132812')
    expect(shown).toContain('-107.41 USD')
    // the drawdown as a magnitude, the same as everywhere else
    expect(shown).toContain('597.36 USD')
  })

  /**
   * ONE ROW PER LEDGER ROW. The response declares its key as (deployment_id, currency), so a bot
   * that booked in two account currencies has two rows carrying different money — and the select
   * had to fold them, because two options reading the same label are two things to a reader.
   */
  it('draws a row per account currency rather than folding them into one', () => {
    const wrapper = mountPicker([
      deployment({ currency: 'USD', net_pnl: -107.4 }),
      deployment({ currency: 'JPY', net_pnl: 250 }),
    ])
    expect(rows(wrapper)).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('-107.40 USD')
    expect(text).toContain('250.00 JPY')
  })

  /**
   * And the key comes from the RESPONSE. Keyed on the deployment alone, Vue would reuse one node
   * for two rows — so this is the assertion that the declaration is actually read.
   */
  it('reads the row identity from the key the ledger declared', () => {
    const wrapper = mountPicker(
      [deployment({ currency: 'USD' }), deployment({ currency: 'JPY' })],
      ['deployment_id', 'currency']
    )
    const keys = rows(wrapper).map(row => row.text())
    expect(new Set(keys).size).toBe(2)
  })

  it('says so plainly where the ledger lists nothing', () => {
    const wrapper = mountPicker([])
    expect(wrapper.text()).toContain('The ledger reports no deployments')
    expect(rows(wrapper)).toHaveLength(0)
  })

  it('chooses the deployment a row belongs to', async () => {
    const wrapper = mountPicker([deployment()])
    const select = vi.spyOn(useDeploymentsStore(), 'selectDeployment').mockResolvedValue()
    await rows(wrapper)[0]!.trigger('click')
    await flushPromises()
    expect(select).toHaveBeenCalledWith('deploy_20260927_132812')
  })

  /** The history below is what the reader came for, so the list gets out of the way. */
  it('collapses to one line once a deployment is chosen, and reopens on request', async () => {
    const wrapper = mountPicker([deployment()])
    useDeploymentsStore().selectedDeploymentId = 'deploy_20260927_132812'
    await flushPromises()

    expect(wrapper.find('.picker-chosen').exists()).toBe(true)
    expect(wrapper.find('.picker-chosen').text()).toContain('demo_btcusd_bot')
    expect(rows(wrapper)).toHaveLength(0)

    await wrapper.find('.picker-chosen button').trigger('click')
    expect(rows(wrapper)).toHaveLength(1)
  })

  describe('what the row leaves out, and where it went', () => {
    /**
     * The rank lives twice — on the column and on the cell — because the list owns the tracks
     * while this component owns the cells. A track given up under a cell that stayed would shift
     * every later cell into the wrong column.
     */
    it('gives every cell the rank its own column declares', () => {
      const wrapper = mountPicker([deployment()])
      const heads = wrapper.findAll('.record-head > span').map(n => n.attributes('data-rank'))
      const cells = wrapper.find('.record-row').findAll(':scope > span')
        .map(n => n.attributes('data-rank'))

      expect(heads).toHaveLength(9)
      expect(cells).toEqual(heads)
      // WHICH deployment, what it is called, what it earned
      expect(heads.filter(rank => rank === '1')).toHaveLength(3)
    })

    it('offers a card on every row, titled by the row the ledger declared', () => {
      const wrapper = mountPicker([deployment({ currency: 'JPY' })])
      expect(wrapper.findAllComponents(HoverCard)).toHaveLength(1)
      expect(wrapper.findAllComponents(HoverCard)[0]?.props('title'))
        .toBe('deploy_20260927_132812 · JPY')
    })

    /**
     * `net_pnl` IS a sum over the sessions and `max_drawdown` is NOT — it is their maximum,
     * because each session carries the running decline against the peak the deployment had already
     * reached. That trap is the backend's own warning and the card repeats it where the figure is.
     */
    it('carries the drawdown caveat beside the drawdown', () => {
      const caveat = cardDetails(mountPicker([deployment()]))
        .find(row => row.label === 'Max drawdown')
      expect(caveat?.value).toContain('597.36 USD')
      expect(caveat?.value).toContain('5.97%')
      expect(caveat?.title).toContain('never their sum')
    })

    /** The identity that does not move — stated, or absent on a profile that declares none. */
    it('names the bot id only where the profile declares one', () => {
      expect(cardRows(mountPicker([deployment()]))['Bot id']).toBe('demo-btc')
      expect(cardRows(mountPicker([deployment({ bot_id: '' })]))['Bot id']).toBeUndefined()
    })

    /**
     * Where everything is fine, nothing is printed: one stand throughout is the ordinary case and
     * says nothing. A configuration that MOVED changes how the figures beneath it must be read.
     */
    it('speaks about the configuration only where it moved', () => {
      const moved = cardRows(mountPicker([deployment({ changed: true })]))
      expect(moved['Configuration']).toBe('moved between sessions')
      expect(cardRows(mountPicker([deployment({ changed: false })]))['Configuration'])
        .toBeUndefined()
    })

    it('marks a moved configuration on the row as well, and nothing where it held', () => {
      expect(mountPicker([deployment({ changed: true })]).find('.deployment-mark').exists())
        .toBe(true)
      expect(mountPicker([deployment({ changed: false })]).find('.deployment-mark').exists())
        .toBe(false)
    })

    /**
     * An absent idle stretch is an absence. A deployment of one session has nothing BETWEEN its
     * sessions, and a `0.0 h` there would claim a measured stretch of no length.
     */
    it('states a missing idle stretch as absent rather than as zero', () => {
      const one = rows(mountPicker([deployment({ longest_gap_hours: null })]))[0]!.text()
      expect(one).toContain('n/a')
      expect(one).not.toContain('0.0 h')

      const several = rows(mountPicker([deployment({ longest_gap_hours: 26.5 })]))[0]!.text()
      expect(several).toContain('26.5 h')
    })
  })

  describe('narrowing the ledger', () => {
    function two() {
      return [
        deployment({ deployment_id: 'a', bot: 'alpha_bot', currency: 'USD', changed: true }),
        deployment({ deployment_id: 'b', bot: 'beta_bot', currency: 'JPY', changed: false }),
      ]
    }

    it('offers the bot and the currency as facets', () => {
      const labels = mountPicker(two()).findAll('.facet-trigger').map(node => node.text())
      expect(labels.some(label => label.includes('Bot'))).toBe(true)
      expect(labels.some(label => label.includes('Currency'))).toBe(true)
    })

    /**
     * And the bar DISABLES one that would change nothing rather than dropping it — a facet offering
     * a single value every row already carries is a control that does nothing while looking like it
     * works. One currency across the whole ledger is exactly that case, and it is the ordinary one
     * here: all three stored deployments book in USD.
     *
     * It used to be dropped, and that was worse. Whether a facet can narrow depends on what is
     * already PICKED, so the set of chips changed on every click and the bar reflowed under an open
     * dropdown — measured on screen 2026-10-08, the operator clicked a value and the menu they were
     * reading moved sideways. The bar keeps its shape now, which is the same decision `AppBar.vue`
     * makes for a section a run does not have.
     */
    it('disables the currency facet where every deployment books in one, and keeps it in place', () => {
      const oneCurrency = [
        deployment({ deployment_id: 'a', bot: 'alpha_bot' }),
        deployment({ deployment_id: 'b', bot: 'beta_bot' }),
      ]
      const triggers = mountPicker(oneCurrency).findAll('.facet-trigger')
      const currency = triggers.find(node => node.text().includes('Currency'))
      expect(currency, 'the facet keeps its slot in the bar').toBeDefined()
      expect(currency!.attributes('disabled')).toBeDefined()
      // and the one that CAN narrow is left alone
      const bot = triggers.find(node => node.text().includes('Bot'))
      expect(bot!.attributes('disabled')).toBeUndefined()
    })

    /**
     * And a chip does not RESIZE when it is used, which is the same complaint with a second cause.
     * The count badge used to be drawn only once something was picked, so the chip grew at that
     * moment and every chip to its right slid along the bar — reported on screen 2026-10-08, one
     * day after the dropped facet above.
     *
     * jsdom computes no layout, so no width can be measured here. What it CAN hold is the
     * invariant that produces the width: every chip carries the slot whether or not it holds a
     * number, and the stylesheet gives that slot a fixed width. The browser measures the rest —
     * `run_selection.spec.ts` compares the bar's geometry across a pick.
     */
    it('keeps the count slot on every chip, picked or not', async () => {
      const wrapper = mountPicker(two())
      const chips = wrapper.findAll('.facet-trigger').length
      expect(wrapper.findAll('.facet-badge')).toHaveLength(chips)
      expect(wrapper.findAll('.facet-badge').every(node => node.text() === '')).toBe(true)

      // the options are teleported to the document, so the pick happens there
      await wrapper.findAll('.facet-trigger')
        .find(node => node.text().includes('Bot'))!
        .trigger('click')
      await flushPromises()
      document.querySelectorAll<HTMLElement>('.facet-option')[0]!.click()
      await flushPromises()

      expect(wrapper.findAll('.facet-badge')).toHaveLength(chips)
      // exactly one chip now counts, and the others still hold their empty slot
      expect(wrapper.findAll('.facet-badge').map(node => node.text()).filter(Boolean))
        .toEqual(['1'])
    })

    /**
     * `changed` is a boolean, and a facet offering `true` / `false` asks the reader to translate.
     * It earns a facet at all because it changes how a deployment's own figures must be read.
     */
    it('offers the configuration as words rather than as a boolean', () => {
      const wrapper = mountPicker(two())
      const trigger = wrapper.findAll('.facet-trigger')
        .find(node => node.text().includes('Configuration'))!
      expect(trigger.text()).not.toContain('true')
      expect(trigger.text()).not.toContain('false')
    })

    it('searches the id and the bot name', async () => {
      const wrapper = mountPicker(two())
      await wrapper.find('.facet-search').setValue('beta')
      expect(rows(wrapper)).toHaveLength(1)
      expect(rows(wrapper)[0]!.text()).toContain('beta_bot')
    })
  })
})
