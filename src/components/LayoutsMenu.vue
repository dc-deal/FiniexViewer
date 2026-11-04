<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { t } from '@/translate'

/**
 * Named layouts in the menu bar (viewer#37): the placement of the panels under a name, loaded with one
 * click, beside the Panels menu that shows and hides them one at a time. A tick marks the layout this
 * window loaded. The menu chooses and the settings manage (2026-11-04): saving, renaming, deleting,
 * resetting and carrying layouts to another machine stand in Settings › Layouts, one entry away.
 */
const store = useNamedLayoutsStore()
const { layouts, loaded } = storeToRefs(store)

const settingsOpen = ref(false)
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="menu-bar-trigger layouts-trigger">{{ t('Layouts') }} ▾</DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content layouts-menu" :side-offset="4" align="start">
        <DropdownMenuItem
          v-for="layout in layouts"
          :key="layout.id"
          class="menu-item"
          :data-layout="layout.id"
          :data-loaded="layout.id === loaded?.id"
          @select="store.load(layout.id)"
        >
          <span class="menu-check" aria-hidden="true">{{ layout.id === loaded?.id ? '✓' : '' }}</span>
          <span class="menu-label">{{ layout.name }}</span>
          <span v-if="layout.shipped" class="layout-word">{{ t('shipped') }}</span>
        </DropdownMenuItem>
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
