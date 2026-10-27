<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { DockviewPanelApi } from 'dockview-vue'
import {
  DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger,
} from 'reka-ui'
import AppIcon from '@/components/base/AppIcon.vue'
import HoverCard from '@/components/base/HoverCard.vue'
import { tabCard } from '@/components/dock/tab_card'
import { memberKindId, memberOfKind } from '@/bundle_members'
import { useSectionStates } from '@/composables/use_section_states'
import { panelKind } from '@/panel_kinds'
import { useDockStore } from '@/stores/dock_store'
import { BUNDLE_IDS } from '@/types/panel_types'
import type { PanelKind } from '@/types/panel_types'
import { t } from '@/translate'

/**
 * A panel's tab: the FORM it takes, its title, and one status where the status says something. The
 * icon is a list or a chart rather than the content, so two lists read alike and the title tells
 * them apart. Its card says what the panel is for, the bundle it belongs to, what it follows and
 * chooses, and the status in words (`tab_card.ts`).
 *
 * Its ✕ HIDES the panel, alike for every panel — the Panels menu shows it again where it stood. A
 * section of the run bundle opened as a panel also carries ⇲, which puts it back into the bundle,
 * and a kind that offers commands about itself carries ⋯ with them (`PanelKind.actions`).
 *
 * @param kindId The panel's kind.
 * @param api The panel's own handle in the dock, which also closes it.
 */
const props = defineProps<{ kindId: string, api: DockviewPanelApi }>()

const dock = useDockStore()
const kind = panelKind(props.kindId)
const title = kind?.title ?? props.api.title ?? props.kindId
/** The member this tab's panel shows, and of which bundle — where it is a member of one. */
const member = memberOfKind(props.kindId)

/**
 * What the tab adds to its title — the run a bundle shows, so two windows comparing two runs are
 * told apart at a glance. Cut short in the tab where it is long, whole in the card.
 */
const subtitle = computed(() => kind?.subtitle?.() ?? null)

/** Read where the tab is drawn, so a status that follows a store follows it here too. */
const status = computed(() => kind?.status?.() ?? null)

/** The panel stands with nothing of the chosen run to show — said by the title, never by hiding. */
const muted = computed(() => kind?.muted?.() ?? false)

/** A bundle's members standing in its column, whose links its card says as its own. */
const bundle = BUNDLE_IDS.find(id => id === kind?.id) ?? null
const states = bundle ? useSectionStates(bundle) : null
const members = computed<PanelKind[]>(() => (states?.value ?? [])
  .filter(state => state.place === 'column' && !state.absent)
  .flatMap(state => panelKind(memberKindId(bundle!, state.section.id)) ?? []))

/** Built where the tab is drawn, so the subtitle, the status and the members follow their stores. */
const card = computed(() => tabCard(kind, props.api.title ?? props.kindId, members.value))

/**
 * The card for the KEYBOARD as well. Dockview keeps a tab's focus on its own element around this
 * one, so the card's trigger never hears it; the tab's focus is listened to there instead — and only
 * a keyboard focus opens it, since a click focuses the tab too and the pointer has its own way in.
 */
const root = ref<HTMLElement | null>(null)
const pointed = ref(false)
const focused = ref(false)
let tabElement: HTMLElement | null = null

function keyboardFocus(element: HTMLElement): boolean {
  try {
    return element.matches(':focus-visible')
  } catch {
    // an engine that does not know the selector: no keyboard card, and the pointer still has one
    return false
  }
}

function onFocusIn(event: FocusEvent): void {
  focused.value = event.target === tabElement && keyboardFocus(tabElement!)
}

function onFocusOut(): void {
  focused.value = false
}

onMounted(() => {
  tabElement = root.value?.closest<HTMLElement>('.dv-tab') ?? null
  tabElement?.addEventListener('focusin', onFocusIn)
  tabElement?.addEventListener('focusout', onFocusOut)
})

onUnmounted(() => {
  tabElement?.removeEventListener('focusin', onFocusIn)
  tabElement?.removeEventListener('focusout', onFocusOut)
})
</script>

<template>
  <HoverCard
    :title="card.title"
    :details="card.details"
    :open="pointed || focused"
    @update:open="value => pointed = value"
  >
    <div ref="root" class="panel-tab" :data-kind="kindId">
      <AppIcon v-if="kind" :name="kind.icon" class="panel-tab-icon" />
      <span class="panel-tab-title" :class="{ muted }">{{ title }}</span>
      <span v-if="subtitle" class="panel-tab-subtitle">· {{ subtitle }}</span>
      <!-- the mark never travels alone: its word is read out with it and written in the card -->
      <span
        v-if="status"
        class="panel-tab-status"
        :class="status.role"
        role="img"
        :aria-label="status.word"
        :data-status="status.word"
      >
        <AppIcon :name="status.icon" />
      </span>
      <DropdownMenuRoot v-if="kind?.actions?.length">
        <DropdownMenuTrigger
          class="panel-tab-button panel-tab-more"
          :title="t('What this panel offers')"
          :aria-label="t('Panel commands')"
        >
          <AppIcon name="action-more" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="menu-content" :side-offset="4" align="start">
            <DropdownMenuItem
              v-for="action in kind.actions"
              :key="action.id"
              class="menu-item"
              :data-action="action.id"
              @select="action.run()"
            >
              <span class="menu-check" aria-hidden="true" />
              {{ action.title }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <button
        v-if="member"
        type="button"
        class="panel-tab-button panel-tab-back"
        :title="t('Back into the bundle')"
        :aria-label="t('Back into the bundle')"
        @click.stop="dock.backIntoColumn(member.member, member.bundle)"
      >
        <AppIcon name="action-back-into-column" />
      </button>
      <button
        type="button"
        class="panel-tab-button panel-tab-close"
        :title="t('Hide — the Panels menu shows it again')"
        :aria-label="t('Hide panel')"
        @click.stop="api.close()"
      >
        <AppIcon name="action-close" />
      </button>
    </div>
  </HoverCard>
</template>

<style scoped>
.panel-tab {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  height: 100%;
  padding: 0 var(--space-sm);
  font-family: monospace;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.panel-tab-status {
  display: inline-flex;
  align-items: center;
}

.panel-tab-title.muted {
  color: var(--color-text-secondary);
}

/* a run id is 24 characters; the date and the time say which run, the card says the rest */
.panel-tab-subtitle {
  max-width: 19ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-tab-status.warning {
  color: var(--color-warning);
}

.panel-tab-status.error {
  color: var(--color-error);
}

.panel-tab-button {
  display: inline-flex;
  align-items: center;
  padding: 1px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}

/* the same two channels every control here has: the surface AND the border, then the press */
.panel-tab-button:hover,
.panel-tab-button[data-state='open'] {
  opacity: 1;
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
}

.panel-tab-button:active {
  background-color: var(--color-bg-active);
  transform: translateY(1px);
}

.panel-tab-button:focus-visible {
  opacity: 1;
  outline: 1px solid var(--color-accent);
}
</style>
