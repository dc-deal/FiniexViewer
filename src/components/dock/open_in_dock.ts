import type { OpenInContext } from '@/composables/use_open_in_context'
import { DEPLOYMENT_BUNDLE, RUN_BUNDLE } from '@/panel_kinds'
import { useConfigCompareStore } from '@/stores/config_compare_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import { useDockStore } from '@/stores/dock_store'
import { useRunsStore } from '@/stores/runs_store'
import { useSweepsStore } from '@/stores/sweeps_store'

/**
 * The way out of a panel in the docked app: the run, the deployment or the sweep is CHOSEN — it
 * becomes the main link's and loads, exactly as a pick in its own list does — and the panel showing
 * it comes to the front: the run's report, the deployment's history, the sweep's ranking, opened
 * where it last stood where the reader had closed it, because a link the reader clicked asks for
 * that panel. A bundle whose members stand open as panels of their own is the exception: the link
 * goes to those members, and the bundle stays as it is (a `link`, see `RevealReason`). No
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
  const compare = useConfigCompareStore()
  function openRun(runId: string, sectionId?: string): void {
    void runs.selectRun(runId)
    // a named section comes forward as a panel of its own: in the column it may stand folded
    // or far below the header, and the reader asked for that section rather than the report
    if (sectionId) dock.openSection(sectionId)
    else dock.reveal(RUN_BUNDLE, 'link')
  }
  return {
    openRun,
    // the comparison is asked for FIRST: the run it names is then the one being chosen, and the
    // root lets a comparison stand only while its run is the one on show
    compareConfiguration: (runId: string, otherRunId: string, otherSide: 'before' | 'after') => {
      void compare.compare(runId, otherRunId, otherSide)
      openRun(runId, 'config')
    },
    openDeployment: (deploymentId: string) => {
      void deployments.selectDeployment(deploymentId)
      // its history is the bundle's — the list beside it only marks the pick (viewer#43)
      dock.reveal(DEPLOYMENT_BUNDLE, 'link')
    },
    openSweep: (sweepId: string) => {
      void sweeps.selectSweep(sweepId)
      dock.reveal('sweeps', 'command')
    },
    canOpen: true,
  }
}
