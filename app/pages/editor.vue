<!--
  /editor — Comark editor demo
  ----------------------------------------------------------------------------
  - Static seed parsed via `comark.parse()` on first request (SSR-shared via
    `useAsyncData` + `useState` so the same tree is restored on hydration).
  - Browser localStorage is the "remote API" mock: the live tree is restored
    from there on mount and saved back on every edit.
  - The editor itself is `<ClientOnly>` because Tiptap's view layer needs a
    DOM. The Comark AST debug pane below it IS rendered on the server, so
    the e2e test can verify the seed parses correctly without a browser.
-->

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { parse } from 'comark'
import * as v from 'valibot'
import { createComarkComponentRegistry, useComarkEditor } from '~/composables/tiptap-comark-nuxt'
import type { ComarkTree } from '~/utils/tiptap-comark'
import AlertNodeView from '~/components/AlertNodeView.vue'

const STORAGE_KEY = 'comark-demo-doc'

// Seed exercised by the e2e test — every feature the converter claims to
// support should appear at least once below.
const SEED_MARKDOWN = `---
title: Comark Editor Demo
author: Demo
---

# Welcome to the Comark editor

Edit this document and reload — your changes are persisted to **localStorage**.

This paragraph mixes **bold**, *italic*, ~~strike~~, and \`inline code\`. There is also a [link to example.com](https://example.com){target="_blank" rel="noopener"}.

::alert{type="info" title="Heads up"}
This is a **block component** rendered by \`AlertNodeView.vue\`. Try clicking the gear icon in the corner of the alert to edit its props.
::

::alert{type="warning"}
A second alert without a title.
::

## Lists & quotes

- A bullet
- Another bullet
  - Nested
  - Items

1. First
2. Second
3. Third

> Markdown blockquote with **inline marks** and a [link](https://example.com).

## Code with a filename and highlight

\`\`\`ts [example.ts] {2}
const greet = (name: string) => {
  console.log(\`Hello, \${name}!\`)
}
\`\`\`

## Table

| Feature      | Status      |
| ------------ | ----------- |
| Headings     | ✅ Working   |
| Marks        | ✅ Working   |
| Tables       | ✅ Working   |
| Components   | ✅ Working   |

---

That's the demo.
`

// SSR-shared state — `useState` guarantees the parsed seed survives the
// hydration boundary without re-parsing on the client.
const tree = useState<ComarkTree>('comark-demo-tree', () => ({
  nodes: [],
  frontmatter: {},
  meta: {},
}))

// Parse the seed once. `useAsyncData` runs server-side and serializes the
// result so the client doesn't re-parse on hydration.
const { data: seed } = await useAsyncData('comark-demo-seed', () => parse(SEED_MARKDOWN))

if (seed.value && tree.value.nodes.length === 0) {
  tree.value = seed.value as ComarkTree
}

const registry = createComarkComponentRegistry([
  {
    name: 'alert',
    kind: 'block',
    schema: v.object({
      type: v.optional(v.picklist(['info', 'warning', 'success', 'error']), 'info'),
      title: v.optional(v.string()),
    }),
    nodeView: AlertNodeView,
  },
])

const { model, extensions, handlers } = useComarkEditor(tree, { registry })

// Browser persistence — load on mount, save on change. Wrapped in
// `import.meta.client` because `localStorage` is undefined on the server.
if (import.meta.client) {
  onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        tree.value = JSON.parse(saved) as ComarkTree
      } catch {
        // ignore corrupt storage
      }
    }
    watch(
      tree,
      (t) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
        } catch {
          // quota / private mode — ignore
        }
      },
      { deep: true },
    )
  })
}

async function resetToSeed() {
  if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
  tree.value = (await parse(SEED_MARKDOWN)) as ComarkTree
}
</script>

<template>
  <UContainer class="py-6">
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold" data-test="editor-heading">Comark editor demo</h1>
      <UButton color="neutral" variant="outline" data-test="reset" @click="resetToSeed">
        Reset to seed
      </UButton>
    </header>

    <ClientOnly>
      <UEditor
        v-model="model"
        content-type="json"
        :extensions="extensions"
        :handlers="handlers"
        class="border border-default rounded-lg"
        data-test="editor"
      />
      <template #fallback>
        <div
          class="flex min-h-100 items-center justify-center rounded-lg border border-default p-4 text-muted"
          data-test="editor-fallback"
        >
          Loading editor…
        </div>
      </template>
    </ClientOnly>

    <details class="mt-6 text-sm">
      <summary class="cursor-pointer font-medium">Comark AST (debug)</summary>
      <pre
        class="mt-2 max-h-96 overflow-auto rounded bg-elevated p-3 text-xs"
        data-test="comark-ast"
        >{{ JSON.stringify(tree, null, 2) }}</pre
      >
    </details>
  </UContainer>
</template>
