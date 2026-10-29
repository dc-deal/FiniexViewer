import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HoverCard from '@/components/base/HoverCard.vue'
import DeploymentSection from '@/components/dock/DeploymentSection.vue'
import DeploymentBundleView from '@/views/DeploymentBundleView.vue'
import { useContextStore } from '@/stores/context_store'
import { useDeploymentSectionsStore } from '@/stores/deployment_sections_store'
import { useDeploymentsStore } from '@/stores/deployments_store'
import type {
  DeploymentBookingPeriodsReport, DeploymentDetail, DeploymentListResponse,
} from '@/types/api/deployment_types'
import listFixture from './fixtures/deployments_list.json'
import detailFixture from './fixtures/deployment_detail.json'
import periodsFixture from './fixtures/deployment_booking_periods.json'

/**
 * The deployment bundle (viewer#43): a deployment's sessions and booking periods as the members of
 * a column, from the captured ledger — the list row, the detail and the periods of one deployment.
 */
const LIST = listFixture as DeploymentListResponse
const DETAIL = detailFixture as DeploymentDetail
const PERIODS = periodsFixture as DeploymentBookingPeriodsReport

/** The chosen deployment loaded, as the binding leaves it once the ledger has answered. */
function loaded(): void {
  const store = useDeploymentsStore()
  store.deployments = LIST.deployments
  store.detail = DETAIL
  store.periods = PERIODS
  useContextStore().selectDeployment(DETAIL.deployment_id)
}

describe('the deployment bundle', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  /** What the members draw is read off the deployments store — the bundle fetches nothing. */
  it('hands each member its model, and says which one the deployment lacks', () => {
    const sections = useDeploymentSectionsStore()
    expect(sections.sources['sessions']).toBeNull()
    expect(sections.lacks('sessions')).toBe(false)

    loaded()
    expect(sections.sources['sessions']).toMatchObject({ detail: DETAIL })
    expect(sections.sources['periods']).toMatchObject({ periods: PERIODS, sessions: DETAIL.sessions })

    // a deployment whose sessions sealed no day yet: loaded, and nothing to draw for its periods
    useDeploymentsStore().periods = { ...PERIODS, periods: [] }
    expect(sections.sources['periods']).toBeNull()
    expect(sections.lacks('periods')).toBe(true)
  })

  it('says where the deployment is chosen while none is', () => {
    useDeploymentsStore().deployments = LIST.deployments
    const wrapper = mount(DeploymentBundleView)
    expect(wrapper.text()).toContain('No deployment is chosen')
    expect(wrapper.find('[data-panel]').exists()).toBe(false)
  })

  /**
   * The bundle's head names the deployment and its bot; the rest of its row, the bot id among it,
   * is the card the list shows. Below it the column holds the two members.
   */
  it('names the chosen deployment above its members, its row on the card', () => {
    loaded()
    const wrapper = mount(DeploymentBundleView)
    expect(wrapper.find('.chosen-id').text()).toBe(DETAIL.deployment_id)
    const card = wrapper.findComponent(HoverCard)
    expect(card.props('title')).toContain(DETAIL.deployment_id)
    expect(wrapper.findAll('[data-panel]').map(node => node.attributes('data-panel'))).toEqual(['sessions', 'periods'])
  })

  /** Open as a panel of its own, a member stands and says why where it has nothing to draw. */
  it('draws a member as a panel of its own, and says why where it has nothing', () => {
    expect(mount(DeploymentSection, { props: { memberId: 'sessions' } }).text())
      .toContain('No deployment is chosen')
    loaded()
    const sessions = mount(DeploymentSection, { props: { memberId: 'sessions' } })
    expect(sessions.find('.deployment-sessions').exists()).toBe(true)
    useDeploymentsStore().periods = { ...PERIODS, periods: [] }
    expect(mount(DeploymentSection, { props: { memberId: 'periods' } }).text())
      .toContain('This deployment carries no such section')
  })
})
