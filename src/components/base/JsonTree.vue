<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Any JSON value as a collapsible tree.
 *
 * The floor under every named view: whatever a component chooses to present specially, everything
 * else stays reachable here. That is what keeps a curated panel from quietly hiding a key nobody
 * thought of — including a key that does not exist yet.
 *
 * Knows nothing about configurations, runs or anything else. It renders values.
 */
const props = withDefaults(defineProps<{
  value: unknown
  /** The key this value sits under; absent at the root. */
  name?: string
  depth?: number
  /** Levels open on first render. 1 shows the top keys with their children folded. */
  openTo?: number
}>(), { depth: 0, openTo: 1, name: '' })

const open = ref(props.depth < props.openTo)

/** Children as [key, value] pairs — array indices included, so nothing is nameless. */
const children = computed<[string, unknown][]>(() => {
  const value = props.value
  if (Array.isArray(value)) return value.map((entry, index) => [String(index), entry])
  if (typeof value === 'object' && value !== null) return Object.entries(value)
  return []
})

const branch = computed(() => typeof props.value === 'object' && props.value !== null)

/** What a folded branch says about itself, so a reader knows whether opening it is worth it. */
const summary = computed(() => {
  if (Array.isArray(props.value)) return `[${props.value.length}]`
  return `{${children.value.length}}`
})

/** The rendered leaf. Strings are quoted so an empty one is visible as a value rather than a gap. */
const leaf = computed(() => {
  const value = props.value
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  return String(value)
})

const leafKind = computed(() => (props.value === null ? 'null' : typeof props.value))
</script>

<template>
  <div class="node" :style="{ '--depth': depth }">
    <button v-if="branch" class="row toggle" :aria-expanded="open" @click="open = !open">
      <span class="caret">{{ open ? '▾' : '▸' }}</span>
      <span class="key">{{ name || '/' }}</span>
      <span class="summary">{{ summary }}</span>
    </button>
    <div v-else class="row">
      <span class="caret" />
      <span class="key">{{ name }}</span>
      <span class="leaf" :class="leafKind" :title="leaf">{{ leaf }}</span>
    </div>

    <template v-if="branch && open">
      <JsonTree
        v-for="[childName, childValue] in children"
        :key="childName"
        :name="childName"
        :value="childValue"
        :depth="depth + 1"
        :open-to="openTo"
      />
    </template>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  padding: 1px 0;
  padding-left: calc(var(--depth) * var(--space-md));
  font-family: monospace;
  font-size: var(--font-size-sm);
}

.toggle {
  width: 100%;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}

.caret {
  flex: 0 0 0.8rem;
  color: var(--color-text-secondary);
}

.key {
  color: var(--color-text-secondary);
}

.summary {
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.leaf {
  color: var(--color-text-primary);
  /* a long value wraps rather than stretching the panel; the whole of it is on the title */
  overflow-wrap: anywhere;
}

/* No colour by type. `accent` is a link and `positive` is the polarity of a figure — a
   configuration value is neither, and syntax colouring here would spend two reserved roles on
   decoration. Only `null` is marked, because an absence is a different KIND of value. */
.leaf.null { color: var(--color-text-secondary); font-style: italic; }
</style>
