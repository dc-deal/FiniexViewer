import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AccountStatus from '@/components/AccountStatus.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useCallerStore, type CallerState } from '@/stores/caller_store'
import type { CallerIdentity } from '@/types/api/caller_types'
import type { Figure } from '@/types/figure_types'

const IDENTITY: CallerIdentity = {
  enforced: true,
  client: 'viewer',
  account: 'viewer-op',
  account_kind: 'person',
  display_name: 'Viewer-Operator',
  grants: ['brokers:*', 'reports:*'],
  note: 'dev proxy holds it',
}

function mountIn(state: CallerState, identity: CallerIdentity | null = null, readAt: Date | null = null) {
  const caller = useCallerStore()
  caller.state = state
  caller.identity = identity
  caller.readAt = readAt
  return mount(AccountStatus)
}

function cardOf(wrapper: ReturnType<typeof mountIn>): { title: string, details: Figure[] } {
  const card = wrapper.findComponent(HoverCard)
  return { title: card.props('title') as string, details: (card.props('details') ?? []) as Figure[] }
}

describe('AccountStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A colour alone says nothing to a reader who cannot tell it apart: every state is a mark and a word. */
  it.each([
    ['idle', 'connecting', 'quiet', 'status-connecting'],
    ['loading', 'connecting', 'quiet', 'status-connecting'],
    ['unenforced', 'no sign-in', 'warning', 'status-warning'],
    ['unauthenticated', 'token refused', 'warning', 'status-warning'],
    ['failed', 'server unreachable', 'error', 'status-error'],
  ] as const)('shows %s as a mark and the word "%s"', (state, word, role, icon) => {
    const wrapper = mountIn(state)
    expect(wrapper.find('.account-word').text()).toBe(word)
    expect(wrapper.find('.account-status').classes()).toContain(role)
    expect(wrapper.find(`[data-icon="${icon}"]`).exists()).toBe(true)
  })

  it('names the account the server reported, quietly', () => {
    const wrapper = mountIn('ready', IDENTITY, new Date())
    expect(wrapper.find('.account-word').text()).toBe('Viewer-Operator')
    expect(wrapper.find('.account-status').classes()).toContain('quiet')
    expect(wrapper.find('[data-icon="status-account"]').exists()).toBe(true)
  })

  /** What the settings' Account tab listed, one hover away from the name. */
  it('hands its card the account, the client, the grants, the note and when it was read', () => {
    const { title, details } = cardOf(mountIn('ready', IDENTITY, new Date()))
    // where everything is fine the rows say it all: no heading above them
    expect(title).toBeUndefined()
    expect(details.map(row => row.label)).toEqual(['Account', 'Client', 'Grants', 'Token note', 'Last checked'])
    expect(details.slice(0, 4).map(row => row.value))
      .toEqual(['viewer-op · person', 'viewer', 'brokers:* · reports:*', 'dev proxy holds it'])
  })

  /**
   * The failure a 200 disguises: with gating off the server verifies no token, so an answer arrives
   * for a credential nobody checked. It must never read as a signed-in identity.
   */
  it('says in its card why there is no identity, and lists none', () => {
    const { title, details } = cardOf(mountIn('unenforced'))
    expect(title).toContain('verifies no token')
    expect(details).toEqual([])
  })
})
