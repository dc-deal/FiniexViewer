<script setup lang="ts">
import { ref } from 'vue'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from 'reka-ui'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useLayoutStore } from '@/stores/layout_store'
import { useSettingsStore } from '@/stores/settings_store'
import { t } from '@/translate'

const layoutStore = useLayoutStore()
const settingsStore = useSettingsStore()

const settingsOpen = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
const notice = ref<string | null>(null)

function exportLayout(): void {
  const blob = new Blob([layoutStore.exportLayout()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'finiexviewer-layout.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function onImportPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // reported rather than thrown: a file that is not a layout is a mistake, not a failure
  notice.value = layoutStore.importLayout(await file.text())
    ? null
    : t('That file is not a layout')
}
</script>

<template>
  <div class="top-menu">
    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-trigger">{{ t('Menu') }}</DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
          <DropdownMenuItem class="menu-item" @select="settingsOpen = true">
            {{ t('Settings…') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="menu-item" @select="settingsStore.toggleTheme()">
            {{ t('Switch theme') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem class="menu-item" @select="exportLayout()">
            {{ t('Export layout') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="menu-item" @select="importInput?.click()">
            {{ t('Import layout') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <!-- An account is a backend capability this project does not have. The entry says so and
               stands in for nothing: a mocked user is a promise the API cannot keep, and it stays. -->
          <DropdownMenuItem class="menu-item" disabled>
            {{ t('Account — not available') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <input
      ref="importInput"
      class="import-input"
      type="file"
      accept="application/json"
      @change="onImportPicked"
    >

    <p v-if="notice" class="menu-notice">
      <span class="mark">⚠</span>{{ notice }}
      <button class="notice-dismiss" @click="notice = null">{{ t('dismiss') }}</button>
    </p>

    <SettingsDialog v-model:open="settingsOpen" />
  </div>
</template>

<style scoped>
.top-menu {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.menu-trigger {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.menu-trigger:hover,
.menu-trigger:focus-visible {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
  outline: none;
}

.import-input {
  display: none;
}

.menu-notice {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  color: var(--color-warning);
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.notice-dismiss {
  background: none;
  border: none;
  color: var(--color-accent);
  cursor: pointer;
  font-family: monospace;
  font-size: var(--font-size-sm);
  text-decoration: underline;
  padding: 0;
}
</style>

<style>
/* portalled out of this component, so it cannot be reached by a scoped rule */
.menu-content {
  min-width: 12rem;
  display: flex;
  flex-direction: column;
  padding: var(--space-xs);
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.menu-item {
  padding: var(--space-xs) var(--space-sm);
  border-radius: 3px;
  color: var(--color-text-primary);
  cursor: pointer;
  outline: none;
  user-select: none;
}

.menu-item[data-highlighted] {
  background-color: var(--color-bg-elevated);
}

.menu-item[data-disabled] {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.menu-separator {
  height: 1px;
  margin: var(--space-xs) 0;
  background-color: var(--color-border);
}
</style>
