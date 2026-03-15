<template>
  <div>
    <UPageHero
      title="demo-bunny-nuxt-v5"
      description="A demo of a SSR Nuxt application on Bunny.net Edge Scripting."
      :links="[
        {
          label: 'View on GitHub',
          to: 'https://github.com/sandros94/demo-bunny-nuxt-v5',
          target: '_blank',
          icon: 'i-lucide-github',
          size: 'xl',
          color: 'neutral',
          variant: 'subtle',
        },
      ]"
    />

    <UContainer>
      <UButton label="Test API" color="primary" variant="outline" @click="run()" />

      <ProsePre>
        {{ data || 'N/A' }}
      </ProsePre>
    </UContainer>

    <UPageSection
      id="stack"
      title="The Stack"
      description="Built entirely on nightly and beta releases — living on the edge, literally."
      :features="[
        {
          icon: 'i-lucide-layers',
          title: 'Nuxt v5 (nightly)',
          description:
            'The next major version of Nuxt, still in nightly builds. Brings a leaner core, improved performance, and tighter integration with the modern Vite ecosystem.',
        },
        {
          icon: 'i-lucide-server',
          title: 'Nitro v3 (beta)',
          description:
            'The server engine powering the SSR runtime. v3 beta introduces a redesigned core built on top of H3 v2 and srvx for runtime-agnostic deployments.',
        },
        {
          icon: 'i-lucide-zap',
          title: 'Vite v8 + Rolldown',
          description:
            'Vite v8 ships with Rolldown as the bundler — a Rust-powered Rollup-compatible bundler that dramatically improves build speed and consistency between dev and prod.',
        },
        {
          icon: 'i-lucide-wrench',
          title: 'Vite+',
          description:
            'A unified toolchain wrapping Vite, Vitest, Oxlint, and Oxfmt under a single `vp` CLI. Handles lint, format, type-check, and commit hooks without extra configuration.',
        },
        {
          icon: 'i-lucide-globe',
          title: 'Bunny.net Edge Scripting',
          description:
            'Deployed as a fully server-side rendered application on Bunny.net\'s Edge Scripting runtime — a Deno-based edge platform distributed globally.',
        },
        {
          icon: 'i-lucide-palette',
          title: 'Nuxt UI',
          description:
            'Components, layouts, and design system from Nuxt UI — providing accessible, themeable building blocks on top of Tailwind CSS v4.',
        },
      ]"
    />
  </div>
</template>

<script setup lang="ts">
const data = ref<string | null>(null)
const timeoutId = ref<ReturnType<typeof setTimeout> | null>(null)

async function run() {
  data.value = await $fetch('/api/test')
  if (timeoutId.value) {
    clearTimeout(timeoutId.value)
  }
  timeoutId.value = setTimeout(() => {
    data.value = null
    timeoutId.value = null
  }, 5000)
}
</script>
