/**
 * Browser interfaces jsdom does not implement, supplied so components that use them can be tested
 * at all. These stand in for MISSING APIs — they never replace behaviour under test: a stub that
 * answered differently from a browser would make the suite agree with itself rather than with
 * reality. reka-ui's floating layer measures its trigger, which is why ResizeObserver is needed.
 */
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverStub
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = (): boolean => false
  Element.prototype.setPointerCapture = (): void => {}
  Element.prototype.releasePointerCapture = (): void => {}
}
