export default defineNuxtConfig({
  modules: ['@comark/nuxt', '@nuxt/ui'],
  compatibilityDate: 'latest',

  css: ['~/assets/css/main.css'],

  // ssr: false,

  nitro: {
    serverDir: './server',
    imports: {},
    preset: './preset/bunny.ts',

    replace: {
      'from "consola"': 'from "consola/browser"',
    },
  },
})
