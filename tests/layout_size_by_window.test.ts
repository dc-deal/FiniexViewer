import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { sizeForWidth, useLayoutSizeByWindow } from '@/composables/use_layout_size_by_window'
import { useArrangementStore } from '@/stores/arrangement_store'
import { useDockStore } from '@/stores/dock_store'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { useSettingsStore } from '@/stores/settings_store'

let mounted: VueWrapper | null = null

/** The window at this width, at rest after the resize. */
function resizeTo(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
  vi.advanceTimersByTime(500)
}

function mountBinding(): void {
  mounted = mount(defineComponent({
    setup() {
      useLayoutSizeByWindow()
      return () => h('div')
    },
  }))
}

describe('sizeForWidth', () => {
  it('is Mobile below the first width, Medium below the second, and Full from there', () => {
    expect(sizeForWidth(899, 900, 1500)).toBe('mobile')
    expect(sizeForWidth(900, 900, 1500)).toBe('medium')
    expect(sizeForWidth(1499, 900, 1500)).toBe('medium')
    expect(sizeForWidth(1500, 900, 1500)).toBe('full')
  })
})

/** The window's width chooses the loaded layout's size (viewer#37) — where the reader switched it on. */
describe('useLayoutSizeByWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
    vi.spyOn(useDockStore(), 'restore').mockImplementation((_layout, prepare) => {
      prepare?.()
      return true
    })
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.useRealTimers()
  })

  it('loads the size the window crossed into, once it rests', () => {
    useSettingsStore().setSizeByWindow(true)
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests', 'full')
    mountBinding()

    resizeTo(1200)
    expect(useArrangementStore().layoutSize).toBe('medium')
    resizeTo(700)
    expect(useArrangementStore().layoutSize).toBe('mobile')
    expect(layouts.loaded?.id).toBe('backtests')
  })

  /** A size picked by hand holds until the window next crosses a width. */
  it('leaves a size picked by hand while the window stays on the same side', () => {
    useSettingsStore().setSizeByWindow(true)
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests', 'full')
    mountBinding()
    layouts.load('backtests', 'mobile')

    resizeTo(1550)
    expect(useArrangementStore().layoutSize).toBe('mobile')
    resizeTo(1400)
    expect(useArrangementStore().layoutSize).toBe('medium')
  })

  it('changes nothing while it is off, nor where no layout is loaded', () => {
    // on by default since 2026-11-10: the reader who would rather not be steered switches it off
    useSettingsStore().setSizeByWindow(false)
    const layouts = useNamedLayoutsStore()
    layouts.load('backtests', 'full')
    mountBinding()
    resizeTo(700)
    expect(useArrangementStore().layoutSize).toBe('full')

    useSettingsStore().setSizeByWindow(true)
    layouts.unload()
    resizeTo(1600)
    expect(layouts.loaded).toBeNull()
  })

  /**
   * On opening the window chooses as well, once the dock is ready (operator, 2026-11-10): a layout left
   * in Full and opened in a narrow window had stood squeezed into it until the window was resized.
   */
  it('takes the window size when the app opens, once the dock is ready, and never while it is off', async () => {
    const layouts = useNamedLayoutsStore()
    layouts.load('deploys', 'full')
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
    mountBinding()
    await nextTick()
    // the dock not ready yet: nothing can be laid out
    expect(useArrangementStore().layoutSize).toBe('full')
    useDockStore().api = {} as never
    await nextTick()
    expect(useArrangementStore().layoutSize).toBe('mobile')

    mounted?.unmount()
    setActivePinia(createPinia())
    vi.spyOn(useDockStore(), 'restore').mockImplementation((_layout, prepare) => {
      prepare?.()
      return true
    })
    useSettingsStore().setSizeByWindow(false)
    useNamedLayoutsStore().load('deploys', 'full')
    mountBinding()
    useDockStore().api = {} as never
    await nextTick()
    expect(useArrangementStore().layoutSize).toBe('full')
  })

  /** Switching it on is the reader's own command, so it applies at once. */
  it('takes the window size at once when it is switched on', async () => {
    useSettingsStore().setSizeByWindow(false)
    const layouts = useNamedLayoutsStore()
    layouts.load('deploys', 'full')
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    mountBinding()
    useSettingsStore().setSizeByWindow(true)
    await nextTick()
    expect(useArrangementStore().layoutSize).toBe('medium')
  })
})
