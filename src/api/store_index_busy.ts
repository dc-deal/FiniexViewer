import axios from 'axios'
import type { AxiosResponse } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Set on the one repeat of a request the server refused with `store_index_busy`. */
    askedAgainWhenBusy?: boolean
  }
}

// their errors document names 5 s; a larger figure is not waited out in full
const DEFAULT_WAIT_S = 5
const LONGEST_WAIT_S = 30

/**
 * Another process held the store index the route reads for longer than the server waits for it
 * (contract 61). The message is the server's `detail`, which is written for a reader.
 */
export class StoreIndexBusyError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'StoreIndexBusyError'
  }
}

function busyAnswer(error: unknown): { response: AxiosResponse, detail: string } | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 503) return null
  const body = error.response.data as { error?: string, detail?: string } | undefined
  return body?.error === 'store_index_busy' ? { response: error.response, detail: body.detail ?? '' } : null
}

/**
 * The seconds to wait before asking once more, from `Retry-After`, or null where the failure is not a
 * busy index or already was the repeat. The server waited a few seconds before it answered, so a
 * second refusal is shown rather than asked again.
 */
export function busyRepeatDelay(error: unknown): number | null {
  const busy = busyAnswer(error)
  if (!busy || busy.response.config?.askedAgainWhenBusy) return null
  const raw = Number.parseInt(String((busy.response.headers as Record<string, unknown>)['retry-after'] ?? ''), 10)
  return Number.isNaN(raw) || raw < 0 ? DEFAULT_WAIT_S : Math.min(raw, LONGEST_WAIT_S)
}

/** The typed error for a busy index that stayed busy, or null; an answer without a `detail` stays as it came. */
export function storeIndexBusyFrom(error: unknown): StoreIndexBusyError | null {
  const busy = busyAnswer(error)
  return busy && busy.detail ? new StoreIndexBusyError(busy.detail) : null
}
