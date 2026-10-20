import type { OpenInContext } from '@/composables/use_open_in_context'
import { RUN_BUNDLE } from '@/panel_kinds'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useSweepsStore } from '@/stores/sweeps_store'

/**
 * The way out of a panel in the docked app: the run, the deployment or the sweep is CHOSEN — it
 * becomes the main link's and loads, exactly as a pick in its own list does — and the panel showing
 * it comes to the front: the run's report, the deployment's history, the sweep's ranking, opened
 * where it last stood where the reader had closed it, because a link the reader clicked asks for
 * that panel (a `command`). No
 * panel knows the dock; each asks this channel.
 *
 * Through the stores' own `select…` and never the context's bare setter. A docked view stays
 * mounted, so nothing reloads behind a context that merely changed: measured 2026-10-14, a run
 * opened from a deployment showed its own sections beside the PREVIOUS run's executive summary,
 * because the summary loads with the choice and the sections follow the context.
 */
export function openInDock(): OpenInContext {
  const runs = useRunsStore()
  const deployments = useDeploymentsStore()
  const sweeps = useSweepsStore()
  const dock = useDockStore()
  return {
    openRun: (runId: string) => {
      void runs.selectRun(runId)
      dock.reveal(RUN_BUNDLE, 'command')
    },
    openDeployment: (deploymentId: string) => {
      void deployments.selectDeployment(deploymentId)
      dock.reveal('deployments', 'command')
    },
    openSweep: (sweepId: string) => {
      void sweeps.selectSweep(sweepId)
      dock.reveal('sweeps', 'command')
    },
    canOpen: true,
  }
}
