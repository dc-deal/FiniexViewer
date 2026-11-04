import { onMounted, onUnmounted, watch } from 'vue'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { useSettingsStore } from '@/stores/settings_store'
import type { LayoutSize } from '@/types/named_layout_types'

/** How long the window rests after a resize before its width is read — a drag resizes it many times. */
const REST_MS = 400

/** The size a window of this width takes: Mobile below Medium's width, Medium below Full's, else Full. */
export function sizeForWidth(width: number, mediumFrom: number, fullFrom: number): LayoutSize {
  if (width < mediumFrom) return 'mobile'
  if (width < fullFrom) return 'medium'
  return 'full'
}

/**
 * The window's width chooses the size of the loaded layout (viewer#37), where the reader switched
 * that on in Settings › Layouts. The size changes when the window, at rest after a resize, stands
 * across a bound from where it stood before — so a size picked by hand in the submenu holds until
 * the window next crosses one, and opening the app keeps the size it was left in. Switching the
 * setting on applies it at once: that is the reader's own command. Called ONCE, at the app root.
 */
export function useLayoutSizeByWindow(): void {
  const settingsStore = useSettingsStore()
  const layouts = useNamedLayoutsStore()
  /** The size the window's width stood for when it last rested. */
  let band: LayoutSize | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function measured(): LayoutSize {
    const { mediumFrom, fullFrom } = settingsStore.settings
    return sizeForWidth(window.innerWidth, mediumFrom, fullFrom)
  }

  /** The loaded layout in the window's size, where it is not in it already. */
  function follow(size: LayoutSize): void {
    if (!settingsStore.settings.sizeByWindow || !layouts.loaded || layouts.loadedSize === size) return
    layouts.load(layouts.loaded.id, size)
  }

  function settle(): void {
    timer = null
    const next = measured()
    const crossed = band !== null && next !== band
    band = next
    if (crossed) follow(next)
  }

  function onResize(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(settle, REST_MS)
  }

  watch(() => settingsStore.settings.sizeByWindow, on => {
    if (on) follow(measured())
  })

  onMounted(() => {
    band = measured()
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    if (timer) clearTimeout(timer)
  })
}
