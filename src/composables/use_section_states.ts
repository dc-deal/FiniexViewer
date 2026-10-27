import { computed, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import { bundleMembers, memberKindId } from '@/bundle_members'
import { useDeploymentSectionsStore } from '@/stores/deployment_sections_store'
import { useDockStore } from '@/stores/dock_store'
import { useLayoutStore } from '@/stores/layout_store'
import { useRunSectionsStore } from '@/stores/run_sections_store'
import type { BundleId, PanelDescriptor } from '@/types/panel_types'

/** Where a section of the run report stands: in the column, open as a panel, or hidden. */
export type SectionPlace = 'column' | 'panel' | 'hidden'

export interface SectionState {
  section: PanelDescriptor
  place: SectionPlace
  /**
   * The chosen run carries no such section — a state of the RUN, not of the reader's arrangement.
   * One still on its way is not absent: it would flicker struck-through on every run change. With
   * no run chosen nothing is absent, because there is no run to lack anything. One that failed to
   * load is not absent either: the run carries it (`run_sections_store.lacks`, the one rule).
   */
  absent: boolean
}

/**
 * Every section of the run report, in the READER's order — the one the column draws — with where
 * it stands and whether the chosen run has it. What the Panels menu lists.
 *
 * A hidden section keeps its place in that order: `hidden` is a flag, not a removal, so an entry
 * that is switched off does not move away from the pointer that switched it.
 */
export function useSectionStates(bundle: BundleId = 'run'): ComputedRef<SectionState[]> {
  const layoutStore = useLayoutStore()
  const { openIds } = storeToRefs(useDockStore())
  // whether the chosen run, or deployment, carries a member — each bundle's own rule
  const sections = bundle === 'deployment' ? useDeploymentSectionsStore() : useRunSectionsStore()

  return computed(() => {
    const byId = new Map(bundleMembers(bundle).map(panel => [panel.id, panel]))
    return layoutStore.arrangedOf(bundle).flatMap(state => {
      const section = byId.get(state.id)
      if (!section) return []
      const place: SectionPlace = openIds.value.includes(memberKindId(bundle, section.id))
        ? 'panel'
        : state.hidden ? 'hidden' : 'column'
      return [{ section, place, absent: sections.lacks(section.source) }]
    })
  })
}
