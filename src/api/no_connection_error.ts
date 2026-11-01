import axios from 'axios'
import { t } from '@/translate'

/**
 * The request never reached the server. The tunnel or the host may be down, and from here the two
 * cannot be told apart, so the sentence names neither as the cause, and it says nothing about what runs
 * behind them: a running bot can sit behind a tunnel that is down (their note on the run host).
 */
export class NoConnectionError extends Error {
  constructor() {
    super(t('No connection to this server: tunnel or host'))
    this.name = 'NoConnectionError'
  }
}

/**
 * The typed error for a failure that is about the connection, or null. The dev proxy answers `502` with
 * `no_connection`; a request that never reached the proxy has no response at all.
 */
export function noConnectionFrom(error: unknown): NoConnectionError | null {
  if (!axios.isAxiosError(error)) return null
  if (error.code === 'ERR_CANCELED') return null
  const proxied = error.response?.status === 502
    && (error.response.data as { error?: string } | undefined)?.error === 'no_connection'
  return proxied || !error.response ? new NoConnectionError() : null
}
