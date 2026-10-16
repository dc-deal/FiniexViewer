<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DOCK_EDGES, useDockStore, type DockEdge } from '@/stores/dock_store'

/**
 * The four edges of the dock, offered while a panel is dragged: dropped on one, the panel docks
 * along the WHOLE edge — a column over the dock's full height, a row over its full width — where
 * a drop on a group only splits that group (operator, 2026-10-16).
 *
 * A thin band right at the edge, because the edges of the dock are the edges of the window at the
 * left, the right and the bottom: a pointer pushed against them stops there by itself. While the
 * band is under the pointer, the room the docked panel will take is shown the way dockview shows
 * its own drop targets.
 */
const dock = useDockStore()
const { dragging } = storeToRefs(dock)
const over = ref<DockEdge | null>(null)

/**
 * Taken on entering as on every move after: a drop target has to accept both, or the browser
 * refuses the drop — and a pointer that comes to rest on the band may send no further move.
 */
function onOver(side: DockEdge, event: DragEvent): void {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  over.value = side
}

function onLeave(side: DockEdge): void {
  if (over.value === side) over.value = null
}

function onDrop(side: DockEdge, event: DragEvent): void {
  event.preventDefault()
  over.value = null
  dock.dockToEdge(side)
}

/**
 * A drag that ends anywhere else ends here too: dropped on dockview's own targets, abandoned with
 * Escape, released outside the window. `drop` is taken as it bubbles, after an edge took its own.
 */
function onEnd(): void {
  over.value = null
  dock.endDrag()
}

onMounted(() => {
  window.addEventListener('dragend', onEnd, true)
  window.addEventListener('drop', onEnd)
})

onUnmounted(() => {
  window.removeEventListener('dragend', onEnd, true)
  window.removeEventListener('drop', onEnd)
})
</script>

<template>
  <template v-if="dragging">
    <div
      v-for="side in DOCK_EDGES"
      :key="side"
      class="dock-edge"
      :class="side"
      :data-edge="side"
      @dragenter="onOver(side, $event)"
      @dragover="onOver(side, $event)"
      @dragleave="onLeave(side)"
      @drop="onDrop(side, $event)"
    />
    <div v-if="over" class="dock-edge-preview" :class="over" aria-hidden="true" />
  </template>
</template>

<style scoped>
/* above every group and every panel kept in the page, so the band is the dock's own at its edge */
.dock-edge {
  position: absolute;
  z-index: 10001;
}

.dock-edge.left,
.dock-edge.right {
  top: 0;
  bottom: 0;
  width: var(--dock-edge-band);
}

.dock-edge.top,
.dock-edge.bottom {
  left: 0;
  right: 0;
  height: var(--dock-edge-band);
}

.dock-edge.left { left: 0; }
.dock-edge.right { right: 0; }
.dock-edge.top { top: 0; }
.dock-edge.bottom { bottom: 0; }

/* the room the docked panel will take — the share `dockToEdge` gives it — in dockview's own colours */
.dock-edge-preview {
  position: absolute;
  z-index: 10000;
  pointer-events: none;
  background-color: var(--dv-drag-over-background-color);
  border: 1px solid var(--dv-drag-over-border-color);
}

.dock-edge-preview.left { left: 0; top: 0; bottom: 0; width: 25%; }
.dock-edge-preview.right { right: 0; top: 0; bottom: 0; width: 25%; }
.dock-edge-preview.top { top: 0; left: 0; right: 0; height: 25%; }
.dock-edge-preview.bottom { bottom: 0; left: 0; right: 0; height: 25%; }
</style>
