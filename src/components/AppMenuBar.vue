<script setup lang="ts">
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger,
} from 'reka-ui'
import AccountStatus from '@/components/AccountStatus.vue'
import MachineStatus from '@/components/MachineStatus.vue'
import AppIcon from '@/components/base/AppIcon.vue'
import TopMenu from '@/components/TopMenu.vue'
import { PANEL_KINDS } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { t } from '@/translate'

/**
 * The frame above the dock: the name, the way to every panel the reader works in, whose access the
 * viewer works under, and the application menu. Frame rather than panel — it is never closed or
 * moved. The way back to the suggested order sits in the settings, beside everything else about
 * arrangement.
 */
const dock = useDockStore()

/** In the suggested order, so the menu reads the way the first arrangement does. */
const kinds = [...PANEL_KINDS].sort((a, b) => a.order - b.order)
</script>

<template>
  <header class="menu-bar">
    <span class="menu-bar-title">FiniexViewer</span>

    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-bar-trigger">{{ t('Panels') }} ▾</DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="start">
          <DropdownMenuItem
            v-for="kind in kinds"
            :key="kind.id"
            class="menu-item"
            :data-kind="kind.id"
            @select="dock.open(kind.id)"
          >
            <AppIcon :name="kind.icon" /> {{ kind.title }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <div class="menu-bar-spacer" />
    <MachineStatus />
    <AccountStatus />
    <TopMenu />
  </header>
</template>

<style scoped>
.menu-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 var(--space-lg);
  height: 2.5rem;
  background-color: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* the panels' own size: the frame names the app, it does not outrank what the panels show */
.menu-bar-title {
  font-family: monospace;
  font-weight: bold;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.menu-bar-spacer {
  flex: 1;
}

/* a control in the link ink, with the two-channel states every control here carries */
.menu-bar-trigger {
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid transparent;
  border-radius: 4px;
  background: none;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-accent);
  cursor: pointer;
}

.menu-bar-trigger:hover,
.menu-bar-trigger[data-state='open'] {
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.menu-bar-trigger:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.menu-bar-trigger:focus-visible {
  outline: 1px solid var(--color-accent);
}
</style>
