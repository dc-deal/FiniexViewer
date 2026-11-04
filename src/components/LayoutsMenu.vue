<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from 'reka-ui'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { LAYOUT_SIZES } from '@/types/named_layout_types'
import type { LayoutSize } from '@/types/named_layout_types'
import { t } from '@/translate'

/**
 * Named layouts in the menu bar (viewer#37): the placement of the panels under a name, loaded with one
 * click, beside the Panels menu that shows and hides them one at a time. A tick marks the layout this
 * window loaded, and in its submenu the size. A click on a layout loads it in the size this window
 * stands in; the submenu loads it in another. The menu chooses and the settings manage (2026-11-04):
 * saving, renaming, deleting, resetting and carrying layouts to another machine stand in
 * Settings › Layouts, one entry away.
 */
const store = useNamedLayoutsStore()
const { layouts, loaded, loadedSize } = storeToRefs(store)

const SIZE_NAMES: Record<LayoutSize, string> = {
  full: t('Full'),
  medium: t('Medium'),
  mobile: t('Mobile'),
}

const settingsOpen = ref(false)
const menuOpen = ref(false)

/**
 * A click on a layout's row loads it in the size this window stands in and closes the menu, as a
 * choice does; the row opens its sizes on hover alone, where the primitive gives it no select.
 */
function loadAsItStands(id: string): void {
  store.load(id)
  menuOpen.value = false
}
</script>

<template>
  <DropdownMenuRoot v-model:open="menuOpen">
    <DropdownMenuTrigger class="menu-bar-trigger layouts-trigger">{{ t('Layouts') }} ▾</DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content layouts-menu" :side-offset="4" align="start">
        <DropdownMenuSub v-for="layout in layouts" :key="layout.id">
          <DropdownMenuSubTrigger
            class="menu-item menu-sub-trigger"
            :data-layout="layout.id"
            :data-loaded="layout.id === loaded?.id"
            @click="loadAsItStands(layout.id)"
          >
            <span class="menu-check" aria-hidden="true">{{ layout.id === loaded?.id ? '✓' : '' }}</span>
            <span class="menu-label">{{ layout.name }}</span>
            <span v-if="layout.shipped" class="layout-word">{{ t('shipped') }}</span>
            <span class="menu-sub-arrow" aria-hidden="true">▸</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent class="menu-content layout-sizes" :side-offset="2" :data-sizes-of="layout.id">
              <DropdownMenuItem
                v-for="size in LAYOUT_SIZES"
                :key="size"
                class="menu-item"
                :data-size="size"
                :data-loaded="layout.id === loaded?.id && size === loadedSize"
                @select="store.load(layout.id, size)"
              >
                <span class="menu-check" aria-hidden="true">{{ layout.id === loaded?.id && size === loadedSize ? '✓' : '' }}</span>
                <span class="menu-label">{{ SIZE_NAMES[size] }}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuItem class="menu-item" data-action="manage-layouts" @select="settingsOpen = true">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">⚙️ {{ t('Manage layouts…') }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <SettingsDialog v-model:open="settingsOpen" tab="layouts" />
</template>

<style scoped>
/* that a layout shipped with the app, in words at the end of its row */
.layout-word {
  margin-left: var(--space-md);
  color: var(--color-text-secondary);
  white-space: nowrap;
}
</style>
