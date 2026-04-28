// Local SFC type shim for the package. Without this the bare
// `import './ComarkEditor.vue'` resolves to `unknown` outside of a host that
// already declares `*.vue` modules (Nuxt does it via auto-generated types,
// but the package shouldn't depend on the host's resolution).
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
