<script setup lang="ts">
import AppButton from '@/components/base/AppButton.vue'

/**
 * A jump to another place in the app: the `link` shape of `AppButton`, with the arrow that says it
 * leaves this panel. A button rather than an anchor, because it asks the host to put the reader
 * somewhere instead of loading an address.
 *
 * It shortens its own name. A table cell cuts the text inside it with an ellipsis, but a button is
 * one box to the cell, which could only clip it whole — so the name is cut here and the arrow stays.
 */
</script>

<template>
  <AppButton variant="link" class="jump-link">
    <span class="jump-name"><slot /></span>
    <span class="jump-arrow" aria-hidden="true">↗</span>
  </AppButton>
</template>

<style scoped>
.jump-link {
  max-width: 100%;
}

.jump-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jump-arrow {
  flex: none;
}
</style>
