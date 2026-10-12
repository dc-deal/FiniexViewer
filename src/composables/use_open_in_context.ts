import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'

/**
 * Where a panel can send the reader, without knowing how the app gets there.
 *
 * A panel names WHAT to open — a run, a deployment's history — and the host decides HOW: today a
 * route of the shell, once the views are docked panels (viewer#31) a link's context and the panel
 * that shows it. A panel that held a route itself would stop being renderable from any other host,
 * which is the contract the position link already keeps for the jump between two of its panels.
 */
export interface OpenInContext {
  /** Put the reader in front of this run. */
  openRun: (runId: string) => void
  /** Put the reader in front of this deployment's history. */
  openDeployment: (deploymentId: string) => void
  /**
   * Can the reader be sent anywhere at all? A panel mounted on its own has no host to send them
   * to, and draws the name as the plain text it is rather than as a way in that leads nowhere.
   */
  canOpen: boolean
}

const OPEN_IN_CONTEXT: InjectionKey<OpenInContext> = Symbol('open-in-context')

export function provideOpenInContext(open: OpenInContext): void {
  provide(OPEN_IN_CONTEXT, open)
}

const NOWHERE: OpenInContext = {
  openRun: () => {},
  openDeployment: () => {},
  canOpen: false,
}

/** The way out in force, or none where no host supplied it. */
export function useOpenInContext(): OpenInContext {
  return inject(OPEN_IN_CONTEXT, NOWHERE)
}
