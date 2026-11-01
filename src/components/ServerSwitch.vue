<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from 'reka-ui'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { serverName, useServersStore } from '@/stores/servers_store'
import { t } from '@/translate'

/**
 * Which server this window shows, always in view: on the second system a mistaken figure is the worse
 * for looking right. One server per window; a second window is how two are compared.
 */
const store = useServersStore()
const { servers, current, answeredAsAnother } = storeToRefs(store)
const settingsOpen = ref(false)

const name = computed(() => (current.value ? serverName(current.value) : t('Server')))
</script>

<template>
  <div class="server-switch">
    <HoverCard
      v-if="answeredAsAnother"
      :title="t('This address now answers as another installation, so the selection kept for the earlier one is not shown here')"
    >
      <span class="server-moved" tabindex="0">
        <AppIcon name="status-warning" />
        <span>{{ t('another installation') }}</span>
      </span>
    </HoverCard>
    <DropdownMenuRoot>
      <DropdownMenuTrigger class="menu-bar-trigger server-trigger">
        <AppIcon name="status-server" />
        <span class="server-name">{{ name }}</span> ▾
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
          <DropdownMenuItem
            v-for="server in servers"
            :key="server.id"
            class="menu-item"
            :data-server="server.id"
            :data-active="server.id === store.activeId"
            @select="store.switchTo(server.id)"
          >
            <span class="server-check" aria-hidden="true">{{ server.id === store.activeId ? '✓' : '' }}</span>
            {{ serverName(server) }}
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-separator" />
          <DropdownMenuItem class="menu-item" data-action="manage-servers" @select="settingsOpen = true">
            ⚙️ {{ t('Manage servers…') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <SettingsDialog v-model:open="settingsOpen" tab="servers" />
  </div>
</template>

<style scoped>
.server-switch {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.server-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.server-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 16rem;
}

.server-check {
  display: inline-block;
  width: 1.5ch;
}

.server-moved {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  color: var(--color-warning);
  cursor: default;
}
</style>
