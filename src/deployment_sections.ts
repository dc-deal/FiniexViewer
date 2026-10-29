import DeploymentSessionsPanel from '@/components/deployments/DeploymentSessionsPanel.vue'
import DeploymentPeriodsPanel from '@/components/deployments/DeploymentPeriodsPanel.vue'
import type { PanelDescriptor } from '@/types/panel_types'

/**
 * The deployment bundle's members (viewer#43), in their own order: what happened across the
 * restarts, then the booking periods of every session on one clock. Each is a list, and each
 * follows the deployment and chooses a run — a session row, a period's run.
 */
const SECTIONS: PanelDescriptor[] = [
  {
    id: 'sessions',
    title: 'Sessions',
    panelTitle: 'Deployment sessions',
    icon: 'form-list',
    component: DeploymentSessionsPanel,
    source: 'sessions',
    defaultOpen: true,
    narrowing: null,
    follows: ['deployment'],
    chooses: ['run'],
  },
  {
    id: 'periods',
    title: 'Booking periods',
    panelTitle: 'Deployment booking periods',
    icon: 'kind-booking-periods',
    component: DeploymentPeriodsPanel,
    source: 'periods',
    defaultOpen: true,
    narrowing: null,
    follows: ['deployment'],
    chooses: ['run'],
  },
]

export function deploymentSections(): PanelDescriptor[] {
  return SECTIONS
}
