<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from 'reka-ui'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useCallerStore } from '@/stores/caller_store'
import { useSettingsStore } from '@/stores/settings_store'
import type { SettingsTab } from '@/types/settings_types'
import { t } from '@/translate'

const settingsStore = useSettingsStore()
const callerStore = useCallerStore()
const { settings } = storeToRefs(settingsStore)
const { displayName, state } = storeToRefs(callerStore)

const settingsOpen = ref(false)
const settingsTab = ref<SettingsTab>('display')

/** The entry names the theme it switches TO, so the symbol and the word say the same thing. */
const themeSwitch = computed(() => settings.value.theme === 'dark'
  ? { icon: '☀️', label: t('Light theme') }
  : { icon: '🌙', label: t('Dark theme') })

/**
 * The menu says which access this viewer works under, as soon as the server tells it. Where there
 * is no identity — gating off, a refused token, an unreachable server — it stays the plain word,
 * because the dialog is where the reason belongs.
 */
const accountLabel = computed(() =>
  state.value === 'ready' && displayName.value ? displayName.value : t('Account')
)

function openSettings(tab: SettingsTab): void {
  settingsTab.value = tab
  settingsOpen.value = true
}
</script>

<template>
  <div class="top-menu">
    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-trigger" :title="t('Menu')" :aria-label="t('Menu')">
        ☰
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
          <DropdownMenuItem class="menu-item" @select="openSettings('display')">
            ⚙️ {{ t('Settings…') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="menu-item" @select="settingsStore.toggleTheme()">
            {{ themeSwitch.icon }} {{ themeSwitch.label }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem class="menu-item" @select="openSettings('account')">
            👤 {{ accountLabel }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <SettingsDialog v-model:open="settingsOpen" :tab="settingsTab" />
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
  font-size: var(--font-size-md);
  line-height: 1.2;
}

.menu-trigger:hover,
.menu-trigger:focus-visible {
  color: var(--color-text-primary);
  border-color: var(--color-accent);
  outline: none;
}
</style>

<style>
/* portalled out of this component, so it cannot be reached by a scoped rule */
.menu-content {
  /* same reason as the dialog: the page has positioned elements that declare a z-index */
  z-index: 70;
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
