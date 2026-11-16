import { nextTick, watch } from 'vue'
import { activeServer } from '@/active_server'
import { readLink, withoutLink } from '@/link_address'
import { useContextStore } from '@/stores/context_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunChartStore } from '@/stores/run_chart_store'
import { useRunsStore } from '@/stores/runs_store'
import { useServersStore } from '@/stores/servers_store'

/** A link waiting through the reload a switch of server needs — this tab's alone, gone once read. */
const PENDING = 'link.pending'

/**
 * The query of the link this page was opened with, taken out of the address at once — so a reload
 * shows the stored state and the address carries no state otherwise — or one a switch of server
 * carried over. Null where there is none.
 */
function takeLink(): string | null {
  const search = window.location.search
  if (readLink(search)) {
    const { pathname, hash } = window.location
    window.history.replaceState(window.history.state, '', `${pathname}${withoutLink(search)}${hash}`)
    return search
  }
  try {
    const held = sessionStorage.getItem(PENDING)
    sessionStorage.removeItem(PENDING)
    return held
  } catch {
    // no storage to read: nothing was carried over
    return null
  }
}

/** Runs `then` once `ready` holds — at once where it already does. */
function whenReady(ready: () => boolean, then: () => void): void {
  if (ready()) {
    then()
    return
  }
  const stop = watch(ready, now => {
    if (!now) return
    stop()
    then()
  })
}

/**
 * Applies the link a page was opened with (viewer#60), ONCE, as a pick: the run, the scenarios in
 * focus and the position chosen through the stores' actions, so the layout the run's kind maps to is
 * offered or loaded as Settings › Layouts says — `pickRun` takes the run as picked even where it is
 * the one the reload brought back. Then the run chart, brought to the front on the link's timeframe
 * and centred on its moment. A link to another server switches to it first, which reloads the page,
 * and is applied there; one to a server not set up here is applied nowhere, and said.
 *
 * Called ONCE, at the app root, after the layout by run.
 */
export function useLinkFromAddress(pickRun: () => void): void {
  const search = takeLink()
  const link = search ? readLink(search) : null
  if (!search || !link) return
  const runs = useRunsStore()
  const servers = useServersStore()

  if (link.server && link.server !== activeServer().id) {
    const server = link.server
    whenReady(() => servers.servers.length > 0, () => {
      if (!servers.servers.some(entry => entry.id === server)) {
        servers.unknownLinkServer = server
        return
      }
      try {
        sessionStorage.setItem(PENDING, search)
      } catch {
        // nothing to carry it through the reload: the switch still happens, the link is lost
      }
      void servers.switchTo(server)
    })
    return
  }

  const context = useContextStore()
  const runChart = useRunChartStore()
  const dock = useDockStore()

  // the run's kind decides the layout, and the index says what kind it is
  whenReady(() => runs.runs.length > 0 || runs.indexError !== null, () => {
    void runs.selectRun(link.run)
    if (link.units.length) context.setUnits(link.units)
    if (link.position) context.mark(link.position)
    pickRun()
    const chart = link.chart
    if (!chart) return
    void nextTick(() => {
      runChart.chooseTimeframe(chart.timeframe)
      runChart.centreOn(chart.at, link.units.length === 1 ? link.units[0]! : link.position?.scenario ?? null)
      dock.reveal('run-chart', 'link')
    })
  })
}
