import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import StateFramePlayer from '@/components/runs/StateFramePlayer.vue'
import { provideFramePlayer } from '@/composables/use_frame_player'
import type { FramePlayerView } from '@/composables/use_frame_player'
import type { RecordedStreams, RecordedWindow } from '@/types/api/state_frame_types'
import windowFixture from './fixtures/recorded_window.json'
import streamsFixture from './fixtures/recorded_streams.json'

/**
 * The controls of a unit's frames over time, against a host that records what it is asked: the
 * buttons, the speed, the arrows on the slider, and the frame on show beneath them.
 */
const FRAMES = (windowFixture as RecordedWindow).state_frames
const STREAM = (streamsFixture as RecordedStreams).streams[0]!

function view(frameAt: number, fields: Partial<FramePlayerView> = {}): FramePlayerView {
  const frame = { ...FRAMES[1]!, record_no: frameAt }
  return {
    stream: STREAM, absence: null, error: null, loading: false, frame,
    following: false, playing: false, speed: 5, ...fields,
  }
}

function mountWith(shown: FramePlayerView | null) {
  const calls: string[] = []
  const Host = defineComponent({
    setup() {
      provideFramePlayer({
        view: () => shown,
        open: unit => { calls.push(`open ${unit}`) },
        seek: (_unit, at) => { calls.push(`seek ${at}`) },
        step: (_unit, by) => { calls.push(`step ${by}`) },
        first: () => { calls.push('first') },
        latest: () => { calls.push('latest') },
        toggle: () => { calls.push('toggle') },
        setSpeed: (_unit, speed) => { calls.push(`speed ${speed}`) },
      })
      return () => h(StateFramePlayer, { unit: 'state_frames_test', latest: FRAMES[0]! })
    },
  })
  return { wrapper: mount(Host), calls }
}

describe('StateFramePlayer', () => {
  /** Without a player — no host, or a session that records nothing over time — the latest frame stands alone. */
  it('shows the latest frame alone where there is no player', () => {
    const { wrapper } = mountWith(null)
    expect(wrapper.find('.player').exists()).toBe(false)
    expect(wrapper.text()).toContain('Account')
  })

  it('opens its unit, and says where it stands on the session clock', () => {
    const { wrapper, calls } = mountWith(view(231))
    expect(calls).toContain('open state_frames_test')
    const where = wrapper.find('.where').text()
    expect(where).toContain('the session clock')
    expect(where).toContain('frame 231 of 344')
  })

  /** Each control asks the host; the arrows on the slider step a frame, since frames come at no fixed interval. */
  it('asks the host for each move, and steps a frame on the arrows', async () => {
    const { wrapper, calls } = mountWith(view(231))
    for (const action of ['first', 'back', 'play', 'on', 'newest']) {
      await wrapper.find(`[data-action="${action}"]`).trigger('click')
    }
    await wrapper.find('[data-action="speed"]').setValue('25')
    await wrapper.find('.scrubber').trigger('keydown', { key: 'ArrowRight' })
    expect(calls.slice(1)).toEqual(['first', 'step -1', 'toggle', 'step 1', 'latest', 'speed 25', 'step 1'])
  })

  /** At the first frame nothing goes back; at the newest nothing goes on, and nothing plays. */
  it('offers no step past either end', () => {
    const atFirst = mountWith(view(1)).wrapper
    expect(atFirst.find('[data-action="first"]').attributes('disabled')).toBeDefined()
    expect(atFirst.find('[data-action="back"]').attributes('disabled')).toBeDefined()
    const atNewest = mountWith(view(STREAM.record_count)).wrapper
    expect(atNewest.find('[data-action="on"]').attributes('disabled')).toBeDefined()
    expect(atNewest.find('[data-action="play"]').attributes('disabled')).toBeDefined()
  })
})
