import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosResponse } from 'axios'
import { NoConnectionError, noConnectionFrom } from '@/api/no_connection_error'
import { describeFailure } from '@/stores/describe_failure'

function refused(status: number, data: unknown): AxiosError {
  const response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } } as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

describe('noConnectionFrom', () => {
  it('reads the answer of the dev proxy as no connection', () => {
    expect(noConnectionFrom(refused(502, { error: 'no_connection', detail: 'ECONNREFUSED' }))).toBeInstanceOf(NoConnectionError)
  })

  it('reads a request with no answer at all the same way: the dev server itself is gone', () => {
    expect(noConnectionFrom(new AxiosError('Network Error', 'ERR_NETWORK'))).toBeInstanceOf(NoConnectionError)
  })

  /** A server's own answer is its own: a 502 from further behind it says something else. */
  it.each([
    [refused(502, { error: 'something_else' })],
    [refused(500, { error: 'no_connection' })],
    [refused(404, {})],
  ])('leaves a server\'s own answer as it came', error => {
    expect(noConnectionFrom(error)).toBeNull()
  })

  it('leaves a request the viewer cancelled itself, and whatever is no request', () => {
    expect(noConnectionFrom(new AxiosError('canceled', 'ERR_CANCELED'))).toBeNull()
    expect(noConnectionFrom(new Error('other'))).toBeNull()
  })

  it('reads on a page as the sentence, never a status code, and blames neither side', () => {
    const text = describeFailure(new NoConnectionError(), 'Could not load the run index')
    expect(text).toBe('Could not load the run index: No connection to this server: tunnel or host')
    expect(text).not.toMatch(/\d{3}/)
  })
})
