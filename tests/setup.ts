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

// jsdom carries FileReader but not Blob.text(). Read through FileReader rather than returning a
// canned string: the test then still proves that the file's own bytes reach the importer.
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(this)
    })
  }
}
