<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppDialog from '@/components/base/AppDialog.vue'
import HintLine from '@/components/base/HintLine.vue'
import { useNamedLayoutsStore } from '@/stores/named_layouts_store'
import { t } from '@/translate'

/**
 * Named layouts in the menu bar (viewer#37): the placement of the panels under a name, loaded with one
 * click, beside the Panels menu that shows and hides them one at a time. A tick marks the layout this
 * window loaded; the actions below act on it. Its changes go into it as they are made, so there is no
 * Save: *Save as* makes a new one, and a shipped one comes back as shipped with *Reset*.
 */
const store = useNamedLayoutsStore()
const { layouts, loaded } = storeToRefs(store)

/** A reader's own layout is loaded: only that one can be renamed or deleted. */
const own = computed(() => loaded.value !== null && loaded.value.shipped === null)

/** The name dialog, for a new layout or the loaded one's new name — or the word after an import. */
const naming = ref<'save' | 'rename' | null>(null)
const name = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const notice = ref<string | null>(null)
/** The first Delete asks; the second deletes. Undone when the menu closes. */
const confirmingDelete = ref(false)
const importInput = ref<HTMLInputElement | null>(null)

const problem = computed(() =>
  naming.value === null ? null : store.nameProblem(name.value, naming.value === 'rename' ? loaded.value?.id ?? null : null))

async function openNaming(mode: 'save' | 'rename'): Promise<void> {
  naming.value = mode
  name.value = mode === 'rename' ? loaded.value?.name ?? '' : ''
  await nextTick()
  nameInput.value?.select()
}

function confirmName(): void {
  if (problem.value || naming.value === null) return
  const done = naming.value === 'save'
    ? store.saveAs(name.value)
    : store.rename(loaded.value?.id ?? '', name.value)
  if (done) naming.value = null
}

function onDelete(event: Event): void {
  if (!loaded.value || !own.value) return
  if (!confirmingDelete.value) {
    // the menu stays open, so the second click is right where the first was
    event.preventDefault()
    confirmingDelete.value = true
    return
  }
  store.remove(loaded.value.id)
  confirmingDelete.value = false
}

function onMenuOpen(open: boolean): void {
  if (!open) confirmingDelete.value = false
}

function exportAll(): void {
  const blob = new Blob([store.exportAll()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'finiexviewer-layouts.json'
  link.click()
  URL.revokeObjectURL(url)
}

async function onImportPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  // reported rather than thrown: a file that is not a layout is a mistake, not a failure
  const taken = store.importAll(await file.text())
  notice.value = taken === null
    ? t('That file holds no layout')
    : `${taken} ${taken === 1 ? t('layout taken') : t('layouts taken')}`
}
</script>

<template>
  <DropdownMenuRoot @update:open="onMenuOpen">
    <DropdownMenuTrigger class="menu-bar-trigger layouts-trigger">{{ t('Layouts') }} ▾</DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content layouts-menu" :side-offset="4" align="start">
        <DropdownMenuItem
          v-for="layout in layouts"
          :key="layout.id"
          class="menu-item"
          :data-layout="layout.id"
          :data-loaded="layout.id === loaded?.id"
          @select="store.load(layout.id)"
        >
          <span class="menu-check" aria-hidden="true">{{ layout.id === loaded?.id ? '✓' : '' }}</span>
          <span class="menu-label">{{ layout.name }}</span>
          <span v-if="layout.shipped" class="layout-word">{{ t('shipped') }}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuItem class="menu-item" data-action="save-as" @select="openNaming('save')">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">{{ t('Save as …') }}</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="menu-item" data-action="rename" :disabled="!own" @select="openNaming('rename')">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">{{ t('Rename …') }}</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="menu-item" data-action="delete" :disabled="!own" @select="onDelete">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label" :class="{ confirming: confirmingDelete }">
            {{ confirmingDelete ? `${t('Really delete')} ${loaded?.name}` : t('Delete …') }}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          class="menu-item"
          data-action="reset-shipped"
          :disabled="!loaded?.shipped"
          @select="loaded && store.resetShipped(loaded.id)"
        >
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">{{ t('Reset to shipped') }}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="menu-separator" />
        <DropdownMenuItem class="menu-item" data-action="export" @select="exportAll()">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">⬇️ {{ t('Export all …') }}</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="menu-item" data-action="import" @select="importInput?.click()">
          <span class="menu-check" aria-hidden="true" />
          <span class="menu-label">⬆️ {{ t('Import …') }}</span>
        </DropdownMenuItem>
        <HintLine id="layouts" class="layouts-hint" />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>

  <input ref="importInput" class="import-input" type="file" accept="application/json" @change="onImportPicked">

  <AppDialog
    :open="naming !== null"
    :title="naming === 'rename' ? t('Rename the layout') : t('Save the placement as a layout')"
    name="layout-name"
    @update:open="open => { if (!open) naming = null }"
  >
    <form class="layout-name" @submit.prevent="confirmName()">
      <label class="layout-name-field">
        <span class="layout-name-label">{{ t('Name') }}</span>
        <input ref="nameInput" v-model="name" class="layout-name-input" name="layout-name" autocomplete="off">
      </label>
      <p v-if="problem && name" class="layout-name-problem">⚠ {{ problem }}</p>
      <!-- Enter in the field submits the form; the button is the same step for a pointer -->
      <AppButton data-action="confirm-name" :disabled="problem !== null" @click="confirmName()">{{ t('Save') }}</AppButton>
    </form>
  </AppDialog>

  <AppDialog :open="notice !== null" :title="t('Layouts')" name="layout-notice" @update:open="open => { if (!open) notice = null }">
    <p class="layout-notice">{{ notice }}</p>
  </AppDialog>
</template>

<style scoped>
/* wide enough that the hint below the entries reads in a few lines rather than a column of words */
.layouts-menu {
  min-width: 18rem;
}

/* that a layout shipped with the app, in words at the end of its row */
.layout-word {
  margin-left: var(--space-md);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* the second click deletes: said in the warning role, with the layout's name */
.confirming {
  color: var(--color-warning);
}

/* as wide as the rows it explains, never wider: a line of its length would stretch the whole menu */
.layouts-hint {
  width: 0;
  min-width: 100%;
  margin-top: var(--space-xs);
}

.import-input {
  display: none;
}

.layout-name {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.layout-name-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.layout-name-label,
.layout-notice {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.layout-name-input {
  background-color: var(--color-bg-elevated);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-xs) var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  outline: none;
}

.layout-name-input:focus {
  border-color: var(--color-accent);
}

.layout-name-problem {
  margin: 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-warning);
}

.layout-name .app-button {
  align-self: flex-start;
}
</style>
