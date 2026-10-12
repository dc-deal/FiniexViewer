import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useOpenInContext } from '@/composables/use_open_in_context'
import type { OpenInContext } from '@/composables/use_open_in_context'
import { provideTestOpenInContext } from './open_in_context_harness'
import type { TestOpenInContext } from './open_in_context_harness'

/** What a panel sees of the channel, read from inside a mounted component the way a panel reads it. */
function seenBy(host: () => void = () => {}): OpenInContext {
  let channel!: OpenInContext
  const Panel = defineComponent({
    setup() {
      channel = useOpenInContext()
      return () => null
    },
  })
  const Host = defineComponent({
    setup() {
      host()
      return () => h(Panel)
    },
  })
  mount(Host)
  return channel
}

describe('useOpenInContext', () => {
  /** A panel mounted on its own has nowhere to send the reader — and says so rather than throwing. */
  it('offers no way out where no host supplied one', () => {
    const channel = seenBy()
    expect(channel.canOpen).toBe(false)
    expect(() => channel.openRun('20261012_074826_88026ae2')).not.toThrow()
    expect(() => channel.openDeployment('deploy_20261012_074850')).not.toThrow()
  })

  it('hands a panel the way out its host supplied', () => {
    let way!: TestOpenInContext
    const channel = seenBy(() => { way = provideTestOpenInContext() })

    expect(channel.canOpen).toBe(true)
    channel.openRun('20261012_074826_88026ae2')
    channel.openDeployment('deploy_20261012_074850')
    expect(way.opened).toEqual([
      { what: 'run', id: '20261012_074826_88026ae2' },
      { what: 'deployment', id: 'deploy_20261012_074850' },
    ])
  })
})
