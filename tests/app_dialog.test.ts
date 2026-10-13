import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import AppDialog from '@/components/base/AppDialog.vue'

let mounted: VueWrapper | null = null

/** The frame is portalled to the end of the document, so it is read there, as a reader meets it. */
function frame(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-dialog')
}

function mountDialog(props: { open: boolean, height?: string }): VueWrapper {
  mounted = mount(AppDialog, {
    attachTo: document.body,
    props: { title: 'About FiniexViewer', name: 'about', ...props },
    slots: { default: '<p class="probe">what is inside</p>' },
  })
  return mounted
}

describe('AppDialog', () => {
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('is not in the document while it is closed', async () => {
    mountDialog({ open: false })
    await flushPromises()
    expect(frame()).toBeNull()
  })

  it('shows its title, its content and one way out, named for its caller', async () => {
    mountDialog({ open: true })
    await flushPromises()
    expect(frame()!.classList).toContain('about-dialog')
    expect(frame()!.querySelector('.app-dialog-title')!.textContent).toBe('About FiniexViewer')
    expect(frame()!.querySelector('.probe')).not.toBeNull()
    expect(frame()!.querySelector('.app-dialog-actions')!.textContent).toContain('Close')
  })

  /** Settings switch tabs inside it, so their frame must not follow the content. */
  it('keeps a fixed height where one is given, and follows its content where none is', async () => {
    mountDialog({ open: true, height: 'min(38rem, 80vh)' })
    await flushPromises()
    expect(frame()!.style.height).toBe('min(38rem, 80vh)')
    mounted!.unmount()

    mountDialog({ open: true })
    await flushPromises()
    expect(frame()!.style.height).toBe('')
  })

  it('asks to be closed from its close button', async () => {
    const wrapper = mountDialog({ open: true })
    await flushPromises()
    frame()!.querySelector<HTMLElement>('.app-dialog-actions button')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })
})
