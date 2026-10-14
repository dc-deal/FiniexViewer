<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from 'reka-ui'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore, pinnedBoundary } from '@/stores/layout_store'
import { reportKindId } from '@/panel_kinds'
import { allPanels } from '@/panel_registry'
import AppIcon from '@/components/base/AppIcon.vue'
import HintLine from '@/components/base/HintLine.vue'
import OverflowRow from '@/components/base/OverflowRow.vue'
import type { PanelDescriptor } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * The inventory of sections, and which of them this run HAS.
 *
 * Takes the same `sources` record `PanelColumn` renders from, so the bar and the column can never
 * disagree about what exists: both read one map, keyed by the `source` each descriptor declares.
 */
const props = defineProps<{
  sources: Record<string, unknown>
  /** Sections on their way for this run — not absent, only not here yet. */
  pending?: Record<string, boolean>
}>()

const layoutStore = useLayoutStore()
const { arrangedPanels } = storeToRefs(layoutStore)
const dock = useDockStore()
const { openIds } = storeToRefs(dock)

/**
 * The toggles, in the READER's order and not the registry's — the same arrangement the column
 * draws, turned on its side.
 *
 * The two have to agree: a reader who drags Broker to the top and then finds its toggle still sixth
 * has two orders to hold in one head, and the bar is the thing they navigate by. So the arrangement
 * decides, and **a switched-off panel keeps its place in it**. That is the point of `hidden` being
 * a flag rather than a removal: a toggle that moves when you flip it is a control that runs away
 * from the finger, and the bar is where you go to bring something back.
 *
 * Nothing is appended here any more. Every registered panel is in the arrangement — reconciliation
 * puts it there — so a new panel needs no change in this file either.
 */
const toggles = computed(() => {
  const byId = new Map(allPanels().map(panel => [panel.id, panel]))
  return arrangedPanels.value.flatMap(state => {
    const panel = byId.get(state.id)
    if (!panel) return []
    const model = props.sources[panel.source]
    return [{
      ...panel,
      shown: !state.hidden,
      pinned: state.pinned,
      // the run carries no such section — a state of the RUN, not of the reader's arrangement. One
      // still on its way is not absent: it would flicker struck-through on every run change
      absent: (model === null || model === undefined) && !props.pending?.[panel.source],
      // open as a panel of its own: the toggle keeps its place, and leads to that panel
      opened: openIds.value.includes(reportKindId(panel.id)),
    }]
  })
})

/**
 * Where the pinned group ends. Drawn as a LINE on the first unpinned toggle rather than as an
 * element between two of them: the bar is a flex row and the column is a drag container, and an
 * extra child would be one more thing to lay out here and one more thing to drag there.
 */
const boundary = computed(() => pinnedBoundary(arrangedPanels.value))

type BarToggle = PanelDescriptor & {
  kind: 'toggle'
  shown: boolean
  pinned: boolean
  absent: boolean
  opened: boolean
  groupStart: boolean
}

interface BarAction {
  kind: 'action'
  id: string
  label: string
  run: () => void
}

type BarItem = BarToggle | BarAction

const actions: BarAction[] = [
  { kind: 'action', id: 'collapse-all', label: t('Collapse all'), run: () => layoutStore.collapseAll() },
  { kind: 'action', id: 'reset-layout', label: t('Reset layout'), run: () => layoutStore.reset() },
]

/**
 * ONE row, in the order things give way: the toggles in the reader's order, then the two actions.
 * Those are used more rarely than any toggle, so they are the first to go behind the control, and
 * while there is room they stand together at the row's end.
 */
const items = computed<BarItem[]>(() => [
  ...toggles.value.map((panel, index) => ({ ...panel, kind: 'toggle' as const, groupStart: index === boundary.value })),
  ...actions,
])

function hiddenToggles(hidden: BarItem[]): BarToggle[] {
  return hidden.filter((item): item is BarToggle => item.kind === 'toggle')
}

function hiddenActions(hidden: BarItem[]): BarAction[] {
  return hidden.filter((item): item is BarAction => item.kind === 'action')
}

/** The hint about the control speaks only while the control is there to be explained. */
const overflowing = ref(false)

function onOverflow(count: number): void {
  overflowing.value = count > 0
}

/** Keeps the menu open, so several sections can be switched in one visit. */
function stayOpen(event: Event): void {
  event.preventDefault()
}

function toggle(id: string, shown: boolean): void {
  // a section open as a panel of its own is not switched here: the click goes to its panel
  if (openIds.value.includes(reportKindId(id))) {
    dock.open(reportKindId(id))
    return
  }
  if (shown) {
    layoutStore.hide(id)
    return
  }
  layoutStore.show(id)
}
</script>

<template>
  <div class="app-bar">
    <!--
      Absent sections stay LISTED and are disabled rather than hidden. Hiding one raises the
      question where it went — the same argument the scenario roster makes for the scenarios that
      produced nothing. The bar is an inventory, and an inventory that silently shortens is not one.

      This is also why the toggles had to stop wearing muted ink at rest: that is the vocabulary of
      a disabled control, and with an actually-disabled state beside it the two would have been
      indistinguishable.
    -->
    <OverflowRow
      :items="items"
      :item-key="(item) => item.id"
      :end-from="toggles.length"
      :more-label="t('More sections and layout actions')"
      @overflow="onOverflow"
    >
      <template #item="{ item }">
        <button
          v-if="item.kind === 'toggle'"
          class="bar-toggle"
          :class="{ shown: item.shown, absent: item.absent, opened: item.opened, 'group-start': item.groupStart }"
          :disabled="item.absent && !item.opened"
          :title="item.absent
            ? `${t(item.title)} — ${t('this run carries no such section')}`
            : (item.opened ? `${t(item.title)} — ${t('open as a panel of its own; a click brings it to the front')}` : t(item.title))"
          @click="toggle(item.id, item.shown)"
        >
          <AppIcon :name="item.icon" class="bar-icon" />
          <span class="bar-label">{{ t(item.title) }}</span>
          <AppIcon v-if="item.opened" name="action-open-panel" class="bar-opened" />
        </button>
        <button v-else class="bar-action" @click="item.run()">{{ item.label }}</button>
      </template>

      <!-- what waits behind the control keeps its state: ticked where shown, struck where the run
           has no such section -->
      <template #menu="{ hidden }">
        <DropdownMenuCheckboxItem
          v-for="item in hiddenToggles(hidden)"
          :key="item.id"
          class="menu-item bar-menu-toggle"
          :class="{ absent: item.absent }"
          :data-section="item.id"
          :model-value="item.shown && !item.absent"
          :disabled="item.absent && !item.opened"
          @update:model-value="toggle(item.id, item.shown)"
          @select="stayOpen"
        >
          <span class="bar-menu-check" aria-hidden="true">{{ item.shown && !item.absent ? '✓' : '' }}</span>
          <AppIcon :name="item.icon" />
          <span class="bar-label">{{ t(item.title) }}</span>
          <AppIcon v-if="item.opened" name="action-open-panel" class="bar-opened" />
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator
          v-if="hiddenToggles(hidden).length && hiddenActions(hidden).length"
          class="menu-separator"
        />
        <DropdownMenuItem
          v-for="action in hiddenActions(hidden)"
          :key="action.id"
          class="menu-item"
          @select="action.run()"
        >
          {{ action.label }}
        </DropdownMenuItem>
      </template>
    </OverflowRow>
    <HintLine v-if="overflowing" id="bar-overflow" />
  </div>
</template>

<style scoped>
/*
 * ONE row that never wraps. It wrapped until 2026-10-13, and in a panel 585 px wide the inventory
 * took four rows — with the run line above it, a quarter of the panel's height before the first
 * section. What does not fit now waits behind `+N` at the row's end, the actions first.
 */
.app-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;
  font-family: monospace;
  font-size: var(--font-size-sm);
}

/*
 * The boundary of the pinned group, as a line on the first toggle after it. The `annotation` role
 * and DASHED, which is what that role is for: it marks a division, not something to weigh and not
 * something that is wrong. It carries a second channel for the same reason the status colours do —
 * the dash reads where the hue does not.
 */
.bar-toggle.group-start {
  border-left: 1px dashed var(--color-annotation);
  padding-left: var(--space-sm);
  margin-left: var(--space-xs);
}

.bar-toggle,
.bar-action {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  /* ink, not muted — muted is what DISABLED means here, and it is used below for exactly that */
  color: var(--color-text-primary);
  cursor: pointer;
  padding: 2px var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  transition: background-color 80ms ease, border-color 80ms ease;
}

.bar-toggle:hover:not(:disabled),
.bar-action:hover {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.bar-toggle:active:not(:disabled),
.bar-action:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.bar-toggle:focus-visible,
.bar-action:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* the chosen one of the group wears the interactive colour, the same as a facet chip does */
.bar-toggle.shown {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background-color: var(--color-bg-active);
}

/* the icon recedes on a section the reader has put away — their doing, not the run's */
.bar-toggle:not(.shown):not(.absent) .bar-icon {
  opacity: 0.6;
}

/* and this is the run's doing: the section does not exist, so the control cannot be used */
.bar-toggle.absent {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.bar-toggle.absent .bar-icon {
  opacity: 0.35;
}

/* open as a panel of its own — the mark beside the word, in the toggle's own colour. A section the
   run lacks stays usable while it is open: the click leads to its panel, which says why */
.bar-opened {
  margin-left: 2px;
}

.bar-toggle.absent.opened {
  cursor: pointer;
}

.bar-toggle.absent .bar-label,
.bar-menu-toggle.absent .bar-label {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.bar-menu-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

/* the tick keeps its column whether or not it is drawn, so the icons stand in one line */
.bar-menu-check {
  display: inline-block;
  width: 1em;
  color: var(--color-accent);
}

@media (prefers-reduced-motion: reduce) {
  .bar-toggle,
  .bar-action {
    transition: none;
  }
}
</style>
