<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { useCallerStore } from '@/stores/caller_store'
import type { Figure } from '@/types/figure_types'
import type { IconName } from '@/types/icon_types'
import { t } from '@/translate'

/**
 * Whose access this viewer works under, in the frame's right-hand corner. Who you are is a fact to
 * see at a glance rather than a setting to open, so it left the settings' Account tab for the
 * menu bar. A mark and a word in every state, never a colour alone; the details are on hover.
 */
const caller = useCallerStore()
const { identity, state, readAt, displayName } = storeToRefs(caller)

interface StatusView {
  icon: IconName
  word: string
  /** A colour role, or `quiet` where nothing is to be weighed. */
  role: 'quiet' | 'warning' | 'error'
  /** The card's heading: what the state means, in a sentence. */
  sentence: string
}

const view = computed<StatusView>(() => {
  switch (state.value) {
    case 'ready':
      return {
        icon: 'status-account',
        word: displayName.value ?? t('signed in'),
        role: 'quiet',
        sentence: t('This viewer works as this account'),
      }
    // a 200 that proves nothing: with gating off the server verifies no token at all, so every
    // identity field is null even for a caller that sent a valid one
    case 'unenforced':
      return {
        icon: 'status-warning',
        word: t('no sign-in'),
        role: 'warning',
        sentence: t('This server verifies no token — there is no identity to show'),
      }
    case 'unauthenticated':
      return { icon: 'status-warning', word: t('token refused'), role: 'warning', sentence: t('The token was refused') }
    case 'failed':
      return { icon: 'status-error', word: t('server unreachable'), role: 'error', sentence: t('The server did not answer') }
    default:
      return {
        icon: 'status-connecting',
        word: t('connecting'),
        role: 'quiet',
        sentence: t('Asking the server which account this viewer works as'),
      }
  }
})

function readAtLabel(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at)
}

/** What the Account tab used to list, now one hover away from the name. */
const details = computed<Figure[]>(() => {
  const rows: Figure[] = []
  const who = identity.value
  if (state.value === 'ready' && who) {
    rows.push({ label: t('Account'), value: [who.account, who.account_kind].filter(Boolean).join(' · ') })
    rows.push({ label: t('Client'), value: who.client ?? '' })
    rows.push({ label: t('Grants'), value: who.grants?.join(' · ') || t('none') })
    if (who.note) rows.push({ label: t('Token note'), value: who.note })
  }
  if (readAt.value) rows.push({ label: t('As of'), value: readAtLabel(readAt.value) })
  return rows
})
</script>

<template>
  <HoverCard :title="view.sentence" :details="details">
    <span class="account-status" :class="view.role" tabindex="0" :data-state="state">
      <AppIcon :name="view.icon" class="account-mark" />
      <span class="account-word">{{ view.word }}</span>
    </span>
  </HoverCard>
</template>

<style scoped>
.account-status {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: 4px;
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  cursor: default;
}

.account-status:focus-visible {
  outline: 1px solid var(--color-accent);
}

.account-status.quiet {
  color: var(--color-text-primary);
}

.account-status.quiet .account-mark {
  color: var(--color-text-secondary);
}

.account-status.warning {
  color: var(--color-warning);
}

.account-status.error {
  color: var(--color-error);
}
</style>
