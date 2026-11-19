<script setup lang="ts">
import { computed } from 'vue'
import HelpInfo from '@/components/base/HelpInfo.vue'
import { panelKind } from '@/panel_kinds'
import { helpFor } from '@/panel_help'

/**
 * The quick bar beside a group's tabs: the few options of the panel in FRONT of that group, and
 * the ⓘ of what that panel is and does (viewer#24) — nothing for a panel that has neither. One per group, so two groups side by side each speak for
 * their own front panel.
 *
 * @param kindId The kind of the group's front panel, or null where the group shows none.
 */
const props = defineProps<{ kindId: string | null }>()

const bar = computed(() => (props.kindId ? panelKind(props.kindId)?.quickBar : undefined) ?? null)
const help = computed(() => helpFor(props.kindId))
</script>

<template>
  <div v-if="bar || help.length" class="quick-bar" :class="{ 'with-options': bar !== null }" :data-quick-bar="kindId">
    <component :is="bar" v-if="bar" />
    <HelpInfo v-if="help.length" :id="help" />
  </div>
</template>

<style scoped>
.quick-bar {
  display: flex;
  align-items: center;
  height: 100%;
}

/* In a short header the ⓘ beside options gives way, as the run chart's link button does: the unit's
   name is what that bar is read for, and the mark cut it to "E…" at the README's width (2026-11-19).
   The help waits for a wider header; a bar of the ⓘ alone keeps it. */
@container dock-header (max-width: 28rem) {
  .quick-bar.with-options > :deep(.help-info) {
    display: none;
  }
}
</style>
