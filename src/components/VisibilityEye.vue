<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'
import AppIcon from '@/components/base/AppIcon.vue'

/**
 * The eye of a group of layers: shown or hidden above its members' own switches (`layer_groups.ts`).
 * Its state is the glyph, and read out as pressed; its words say what a click does.
 *
 * @param shown Whether the group stands shown.
 * @param hideLabel What a click does while it is shown.
 * @param showLabel What a click does while it is hidden.
 */
defineProps<{ shown: boolean, hideLabel: string, showLabel: string }>()

const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <AppButton
    variant="quiet"
    size="compact"
    glyph
    :aria-pressed="shown"
    :aria-label="shown ? hideLabel : showLabel"
    @click="emit('toggle')"
  ><AppIcon :name="shown ? 'status-shown' : 'status-hidden'" /></AppButton>
</template>
