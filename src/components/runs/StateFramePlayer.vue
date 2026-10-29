<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'
import AppButton from '@/components/base/AppButton.vue'
import AppSelect from '@/components/base/AppSelect.vue'
import StateFrameBody from '@/components/runs/StateFrameBody.vue'
import { utcInstant } from '@/components/runs/report_format'
import { useFramePlayer } from '@/composables/use_frame_player'
import { SPEEDS } from '@/stores/frame_player_store'
import { t } from '@/translate'
import type { StateFrame } from '@/types/api/state_frame_types'

/**
 * A unit's frames over time, played (viewer half of testingide#580): the first, one back, play or
 * stop, one on, the newest; the speed in frames per second; and a slider along the session's own
 * clock — `frame_time`, the only axis, since the machine's clock says only how long ago. Below it,
 * the frame on show.
 *
 * Where the host offers no player, or the session records nothing over time, the latest frame is
 * shown alone, as before.
 */
const props = defineProps<{
  unit: string
  /** The latest frame, shown until the player has one of its own. */
  latest: StateFrame
}>()

const player = useFramePlayer()

onMounted(() => player.open(props.unit))
watch(() => props.unit, unit => player.open(unit))

const view = computed(() => player.view(props.unit))
const stream = computed(() => view.value?.stream ?? null)
const frame = computed<StateFrame>(() => view.value?.frame ?? props.latest)

/** Along the session's clock, from its first frame to its newest — drawn only where there are two. */
const span = computed(() => {
  const first = stream.value?.first_record_time
  const last = stream.value?.last_record_time
  if (!first || !last || (stream.value?.record_count ?? 0) < 2) return null
  return { min: Date.parse(first), max: Date.parse(last) }
})

const number = computed(() => view.value?.frame?.record_no ?? null)
const atFirst = computed(() => number.value === 1)
const atNewest = computed(() => number.value !== null && number.value === stream.value?.record_count)

const speeds = SPEEDS.map(speed => ({ value: String(speed), label: `${speed} ${t('per s')}` }))

/** The arrows step a frame rather than a slice of time: frames come at no fixed interval. */
function onKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  event.stopPropagation()
  player.step(props.unit, event.key === 'ArrowRight' ? 1 : -1)
}
</script>

<template>
  <div v-if="span && view" class="player" :data-frame="number">
    <div class="transport">
      <AppButton size="compact" variant="quiet" glyph :disabled="atFirst" :title="t('The first frame')" data-action="first" @click="player.first(unit)">⏮</AppButton>
      <AppButton size="compact" variant="quiet" glyph :disabled="atFirst" :title="t('One frame back')" data-action="back" @click="player.step(unit, -1)">◀</AppButton>
      <AppButton
        size="compact"
        variant="quiet"
        glyph
        :disabled="atNewest && !view.playing"
        :title="view.playing ? t('Stop') : t('Play from this frame')"
        data-action="play"
        @click="player.toggle(unit)"
      >
        {{ view.playing ? '❚❚' : '▶' }}
      </AppButton>
      <AppButton size="compact" variant="quiet" glyph :disabled="atNewest" :title="t('One frame on')" data-action="on" @click="player.step(unit, 1)">▶|</AppButton>
      <AppButton
        size="compact"
        variant="quiet"
        glyph
        :active="view.following"
        :title="t('The newest frame — and the ones that follow, while the session records')"
        data-action="newest"
        @click="player.latest(unit)"
      >
        ⏭
      </AppButton>
      <AppSelect
        compact
        :label="t('Frames per second')"
        :model-value="String(view.speed)"
        :options="speeds"
        data-action="speed"
        @update:model-value="value => player.setSpeed(unit, Number(value))"
      />
    </div>
    <SliderRoot
      class="scrubber"
      :model-value="[Date.parse(frame.frame_time)]"
      :min="span.min"
      :max="span.max"
      :step="1000"
      :aria-label="t('The session clock')"
      @update:model-value="value => value && player.seek(unit, value[0]!)"
      @keydown.capture="onKey"
    >
      <SliderTrack class="track">
        <SliderRange class="range" />
      </SliderTrack>
      <SliderThumb class="thumb" :aria-label="t('The frame on show')" />
    </SliderRoot>
    <p class="where">
      {{ utcInstant(frame.frame_time) }} — {{ t('the session clock') }}
      · {{ t('frame') }} {{ number ?? '—' }} {{ t('of') }} {{ stream?.record_count }}
      · {{ t('written for') }} {{ frame.written_for }}
      <span v-if="view.loading" class="loading"> · {{ t('reading') }}</span>
    </p>
  </div>
  <p v-if="view?.error" class="error">{{ view.error }}</p>
  <StateFrameBody :frame="frame" />
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
}

.scrubber {
  position: relative;
  display: flex;
  align-items: center;
  height: 18px;
  touch-action: none;
  user-select: none;
}

.track {
  position: relative;
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background-color: var(--color-border);
}

.range {
  position: absolute;
  height: 100%;
  border-radius: 2px;
  background-color: var(--color-accent);
}

.thumb {
  display: block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-accent);
  border-radius: 50%;
  background-color: var(--color-bg-base);
  cursor: grab;
}

.thumb:hover {
  background-color: var(--color-bg-hover);
}

.thumb:active {
  cursor: grabbing;
}

.thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.where {
  margin: 0;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.error {
  margin: 0;
  color: var(--color-error);
}
</style>
