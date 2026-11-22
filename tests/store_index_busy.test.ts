import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosResponse } from 'axios'
import { StoreIndexBusyError, busyRepeatDelay, storeIndexBusyFrom } from '@/api/store_index_busy'
import { describeFailure } from '@/stores/describe_failure'

const DETAIL = 'The run ledger index is being written by another process and did not come free in time; try again in a few seconds'

function refused(status: number, data: unknown, headers: Record<string, string> = {}, repeat = false): AxiosError {
  const config = { headers: new AxiosHeaders(), askedAgainWhenBusy: repeat }
  const response = { status, data, statusText: '', headers, config } as AxiosResponse
  return new AxiosError('Request failed with status code ' + status, 'ERR_BAD_RESPONSE', config, undefined, response)
}

const busy = (headers: Record<string, string> = { 'retry-after': '5' }, repeat = false) =>
  refused(503, { error: 'store_index_busy', detail: DETAIL }, headers, repeat)

describe('busyRepeatDelay', () => {
  it('waits the seconds the answer names', () => {
    expect(busyRepeatDelay(busy())).toBe(5)
    expect(busyRepeatDelay(busy({ 'retry-after': '2' }))).toBe(2)
  })

  it('waits the documented 5 s where the header is missing or unreadable, and never longer than 30 s', () => {
    expect(busyRepeatDelay(busy({}))).toBe(5)
    expect(busyRepeatDelay(busy({ 'retry-after': 'soon' }))).toBe(5)
    expect(busyRepeatDelay(busy({ 'retry-after': '600' }))).toBe(30)
  })

  /** The server already waited before it answered, so the repeat is the last ask. */
  it('asks only once', () => {
    expect(busyRepeatDelay(busy(undefined, true))).toBeNull()
  })

  it.each([
    [refused(503, { error: 'something_else' })],
    [refused(500, { error: 'store_index_busy' })],
    [new Error('other')],
  ])('leaves every other failure alone', error => {
    expect(busyRepeatDelay(error)).toBeNull()
  })
})

describe('storeIndexBusyFrom', () => {
  it('reads on a page as the sentence of the server, never a status code', () => {
    const error = storeIndexBusyFrom(busy(undefined, true))
    expect(error).toBeInstanceOf(StoreIndexBusyError)
    const text = describeFailure(error, 'Could not load the run index')
    expect(text).toBe(`Could not load the run index: ${DETAIL}`)
    expect(text).not.toMatch(/\d{3}/)
  })

  it('leaves an answer without a sentence as it came, and every other failure', () => {
    expect(storeIndexBusyFrom(refused(503, { error: 'store_index_busy' }))).toBeNull()
    expect(storeIndexBusyFrom(refused(503, { error: 'something_else', detail: DETAIL }))).toBeNull()
  })
})
