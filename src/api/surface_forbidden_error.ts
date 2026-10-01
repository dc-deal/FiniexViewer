/**
 * The request was authenticated but the token carries nothing on the surface the route belongs to.
 * Distinct from a 401, which means no usable credential at all, and from an outage: the backend is
 * healthy and answering, and repeating the request will not help.
 *
 * Carries the surface rather than the backend's own text, which names every grant the token holds
 * — infrastructure detail that belongs in a log, not on a page.
 */
export class SurfaceForbiddenError extends Error {
  readonly surface: string

  constructor(surface: string) {
    super(`This viewer's token carries no access to ${surface}`)
    this.name = 'SurfaceForbiddenError'
    this.surface = surface
  }
}
