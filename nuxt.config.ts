// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  // Force dark mode — no toggle needed for this ops tool
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
})
