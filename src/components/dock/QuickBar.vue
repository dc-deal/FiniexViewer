<script setup lang="ts">
import { computed } from 'vue'
import { panelKind } from '@/panel_kinds'

/**
 * The quick bar beside a group's tabs: the few options of the panel in FRONT of that group, and
 * nothing for a panel that has none. One per group, so two groups side by side each speak for
 * their own front panel.
 *
 * @param kindId The kind of the group's front panel, or null where the group shows none.
 */
const props = defineProps<{ kindId: string | null }>()

const bar = computed(() => (props.kindId ? panelKind(props.kindId)?.quickBar : undefined) ?? null)
</script>

<template>
  <div v-if="bar" class="quick-bar" :data-quick-bar="kindId">
    <component :is="bar" />
  </div>
</template>

<style scoped>
.quick-bar {
  display: flex;
  align-items: center;
  height: 100%;
}
</style>
