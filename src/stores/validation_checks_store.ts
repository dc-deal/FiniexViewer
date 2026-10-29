import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { getValidationChecks } from '@/api/api_client'
import type { ValidationCheck } from '@/types/api/validation_check_types'

/**
 * The backend's catalogue of validation checks, read ONCE: what a warning's check id means. It
 * changes only with the backend's code, never with the run on screen, so it is asked for at the
 * first need and kept. Where it could not be read, a warning keeps its own sentence and no title.
 */
export const useValidationChecksStore = defineStore('validation_checks', () => {
  const checks = shallowRef(new Map<string, ValidationCheck>())
  let asked = false

  async function load(): Promise<void> {
    if (asked) return
    asked = true
    try {
      const answer = await getValidationChecks()
      checks.value = new Map(answer.checks.map(check => [check.check, check]))
    } catch {
      // a catalogue that failed is asked again on the next load; the warnings stand meanwhile
      asked = false
    }
  }

  return { checks, load }
})
