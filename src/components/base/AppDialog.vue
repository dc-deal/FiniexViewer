<script setup lang="ts">
import {
  DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import { t } from '@/translate'

/**
 * What is set or read and then closed: a DIALOG, over everything, with its title, its content and
 * one way out. The settings and About are dialogs; what the reader keeps open beside the work is a
 * panel instead. One frame for every dialog, so they look and behave alike and none of them
 * re-invents the overlay or the close.
 *
 * @param open Whether it is shown — `v-model:open`.
 * @param title What it is, read out by a screen reader as its name.
 * @param name Names it for its caller's styles and tests: the frame carries `<name>-dialog`.
 * @param height A fixed height where the content must not move the frame — the settings switch
 *   tabs inside it. Left out, the frame is as tall as its content, 80 % of the window at most.
 */
const props = defineProps<{
  open: boolean
  title: string
  name: string
  height?: string
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="value => emit('update:open', value)">
    <DialogPortal>
      <DialogOverlay class="app-dialog-overlay" />
      <!-- no description on purpose: the title names it and what is inside labels itself.
           Stated rather than left out, which is what the primitive asks for. -->
      <DialogContent
        :class="['app-dialog', `${name}-dialog`]"
        :style="height ? { height } : undefined"
        :aria-describedby="undefined"
      >
        <DialogTitle class="app-dialog-title">{{ title }}</DialogTitle>
        <div class="app-dialog-body">
          <slot />
        </div>
        <div class="app-dialog-actions">
          <!-- as-child: the primitive keeps the dismiss behaviour, AppButton carries the look -->
          <DialogClose as-child>
            <AppButton>{{ t('Close') }}</AppButton>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/* Above every positioned thing on the page. Without this the timeline's spans (--z-chart) paint
   straight through a dialog that declares none — measured, not guessed. */
.app-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background-color: rgb(0 0 0 / 50%);
}

/* 80 % of the window caps both sides, and the content scrolls inside a frame that stays put */
.app-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: var(--z-dialog);
  width: min(30rem, 80vw);
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.app-dialog-title {
  flex-shrink: 0;
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
}

.app-dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.app-dialog-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
