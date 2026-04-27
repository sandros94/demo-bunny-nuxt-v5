// SFC import shim — TypeScript doesn't know how to resolve `*.vue` files
// without help. Vue itself ships this declaration in apps via `vue/jsx`
// types, but a standalone library needs its own.

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // Three `unknown`s match Vue's published shape for SFC types.
  const component: DefineComponent<unknown, unknown, unknown>
  export default component
}
