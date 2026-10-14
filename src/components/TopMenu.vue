<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from 'reka-ui'
import AboutDialog from '@/components/AboutDialog.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { useSettingsStore } from '@/stores/settings_store'
import { t } from '@/translate'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const settingsOpen = ref(false)
const aboutOpen = ref(false)

/** The entry names the theme it switches TO, so the symbol and the word say the same thing. */
const themeSwitch = computed(() => settings.value.theme === 'dark'
  ? { icon: '☀️', label: t('Light theme') }
  : { icon: '🌙', label: t('Dark theme') })

</script>

<template>
  <div class="top-menu">
    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-trigger" :title="t('Menu')" :aria-label="t('Menu')">
        ☰
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
          <DropdownMenuItem class="menu-item" @select="settingsOpen = true">
            ⚙️ {{ t('Settings…') }}
          </DropdownMenuItem>
          <DropdownMenuItem class="menu-item" @select="settingsStore.toggleTheme()">
            {{ themeSwitch.icon }} {{ themeSwitch.label }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem class="menu-item" data-action="about" @select="aboutOpen = true">
            ℹ️ {{ t('About FiniexViewer') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <SettingsDialog v-model:open="settingsOpen" />
    <AboutDialog v-model:open="aboutOpen" />
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
  /* the link ink: muted ink on a raised surface is what a DISABLED control looks like here */
  color: var(--color-accent);
  cursor: pointer;
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
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
  /* above a popover: a menu opened over one has to win, and the two sat at the same value until
     the scale in tokens.css named them apart */
  z-index: var(--z-menu);
  min-width: 12rem;
  display: flex;
  flex-direction: column;
  padding: var(--space-xs);
  background-color: var(--color-bg-overlay);
  border: 1px solid var(--color-border-overlay);
  border-radius: 4px;
  box-shadow: var(--shadow-overlay);
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

/* the lifting step: on the overlay surface the elevated one is the darker of the two */
.menu-item[data-highlighted] {
  background-color: var(--color-bg-hover);
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
