<script setup lang="ts" generic="T">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { fittingCount } from '@/components/base/overflow_fit'

/**
 * One row that never wraps: the items that fit stand in it, in their order, and the rest wait
 * behind `+N ▾` at its end. The known shape for a bar that has to stay one line — GitHub's
 * repository tabs, the actions above an editor in VS Code — and the wider the row, the less there
 * is behind the control, until there is nothing and the control is gone.
 *
 * Items are measured where they stand. One past the count stays in the row, unseen and out of
 * reach, so its width is known the moment there is room for it again.
 */
const props = defineProps<{
  items: T[]
  itemKey: (item: T) => string
  /** From this index on, the items stand at the row's END — a group of actions apart from the rest. */
  endFrom?: number
  /** What the control is called for a screen reader and on hover. */
  moreLabel: string
}>()

const emit = defineEmits<{
  /** How many items wait behind the control — zero once everything fits. */
  overflow: [count: number]
}>()

defineSlots<{
  item(props: { item: T }): unknown
  menu(props: { hidden: T[] }): unknown
}>()

const row = ref<HTMLElement | null>(null)
const more = ref<HTMLElement | null>(null)
const count = ref(props.items.length)

const hidden = computed(() => props.items.slice(count.value))

/** The control takes the end where the end group has gone behind it. */
const moreAtEnd = computed(() => props.endFrom !== undefined && count.value <= props.endFrom)

function measure(): void {
  const element = row.value
  if (!element) return
  const cells = [...element.querySelectorAll<HTMLElement>(':scope > .overflow-cell')]
  const widths = cells.map(cell => cell.getBoundingClientRect().width)
  const gap = parseFloat(getComputedStyle(element).columnGap) || 0
  const control = more.value?.getBoundingClientRect().width ?? 0
  count.value = fittingCount(widths, gap, element.getBoundingClientRect().width, control)
}

// the row's width is the reader's arrangement, and an item's width changes with its label
const observer = new ResizeObserver(() => measure())

function observeAll(): void {
  observer.disconnect()
  if (!row.value) return
  observer.observe(row.value)
  for (const cell of row.value.querySelectorAll(':scope > .overflow-cell')) observer.observe(cell)
}

onMounted(() => {
  observeAll()
  measure()
})

onUnmounted(() => observer.disconnect())

watch(() => props.items.map(props.itemKey).join('\n'), async () => {
  await nextTick()
  observeAll()
  measure()
})

watch(() => hidden.value.length, length => emit('overflow', length), { immediate: true })
</script>

<template>
  <div ref="row" class="overflow-row">
    <div
      v-for="(item, index) in items"
      :key="itemKey(item)"
      class="overflow-cell"
      :class="{ 'overflow-gone': index >= count, 'overflow-end': index === endFrom && index < count }"
      :aria-hidden="index >= count || undefined"
      :inert="index >= count || undefined"
    >
      <slot name="item" :item="item" />
    </div>

    <!-- always in the row so its width is known; seen only while something waits behind it -->
    <span ref="more" class="overflow-more-cell" :class="{ 'overflow-idle': !hidden.length, 'overflow-end': moreAtEnd }">
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          class="overflow-more"
          :disabled="!hidden.length"
          :aria-label="`${moreLabel}: ${hidden.length}`"
          :title="moreLabel"
        >+{{ hidden.length }} ▾</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" :side-offset="4" align="end">
            <slot name="menu" :hidden="hidden" />
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </span>
  </div>
</template>

<style scoped>
.overflow-row {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.overflow-cell,
.overflow-more-cell {
  flex-shrink: 0;
}

/* behind the control: still laid out at its own width, so it can be measured, but never seen */
.overflow-gone,
.overflow-idle {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}

.overflow-end {
  margin-left: auto;
}

/* a control like every other: the link ink, and each state on two channels */
.overflow-more {
  min-width: 3.5em;
  padding: 2px var(--space-sm);
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-accent);
  cursor: pointer;
  font-family: monospace;
  font-size: var(--font-size-sm);
  transition: background-color 80ms ease, border-color 80ms ease;
}

.overflow-more:hover,
.overflow-more[data-state='open'] {
  background-color: var(--color-bg-hover);
  border-color: var(--color-accent);
}

.overflow-more:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.overflow-more:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .overflow-more {
    transition: none;
  }
}
</style>
