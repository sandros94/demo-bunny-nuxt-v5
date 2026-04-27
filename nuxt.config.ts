export default defineNuxtConfig({
  modules: ['@comark/nuxt', '@nuxt/ui'],
  compatibilityDate: 'latest',

  css: ['~/assets/css/main.css'],

  // ssr: false,

  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor',
        '@tiptap/core',
        '@tiptap/extension-document',
        '@tiptap/extension-text',
        '@tiptap/vue-3',
        'comark',
        'comark/render',
      ],
    },
  },

  nitro: {
    serverDir: './server',
    imports: {},

    replace: {
      'from "consola"': 'from "consola/browser"',
    },
  },
})
