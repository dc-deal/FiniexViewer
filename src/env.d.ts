/// <reference types="vite/client" />

declare module 'splitpanes' {
  import type { DefineComponent } from 'vue'
  export const Splitpanes: DefineComponent<object, object, unknown>
  export const Pane: DefineComponent<object, object, unknown>
}
