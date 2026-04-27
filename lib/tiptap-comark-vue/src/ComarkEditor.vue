<!--
  ComarkEditor.vue — drop-in component on top of `useComarkEditor`.

  Two usage modes:

  1. **Self-contained**: pass `:initial`, `:components`, `:extensions` and
     optionally any of `v-model:ast`, `v-model:markdown`, `v-model:json`.
     The component creates its own editor via `useComarkEditor` and wires
     two-way binding through the composable's `setAst` / `getAst` (etc.)
     methods. Bind whichever flavor your app stores; bind several
     simultaneously if you want both, e.g. AST for storage and markdown
     for a side-by-side preview.

  2. **Bring-your-own-editor**: pass `:editor="myEditor"` (constructed
     elsewhere via `useComarkEditor`). The component is purely a
     presentational wrapper around the editor's content. v-model bindings
     are not active in this mode — drive the editor via your own
     composable result.

  Components and extensions are read once at mount (the composable's
  schema is stamped at construction). To swap them, re-key the parent.
-->

<script setup lang="ts">
import { computed, watch } from 'vue'
import type { AnyExtension, Editor } from '@tiptap/core'
import { EditorContent, type Editor as VueEditor } from '@tiptap/vue-3'
import type { ComarkTree, JSONContent } from 'tiptap-comark'
import { useComarkEditor, type UseComarkEditorOptions } from './use-comark-editor'
import type { ComarkVueComponentExports } from './define-component'

interface Props {
  /** Bring-your-own editor instance (skips internal `useComarkEditor`). */
  editor?: Editor | undefined
  /**
   * Initial document — read once at mount. Not reactive. To replace
   * content later, use a `v-model:*` binding or the editor's setters
   * exposed via the slot / template ref.
   */
  initial?: ComarkTree | JSONContent | string
  /** Two-way bind a Comark AST. */
  ast?: ComarkTree
  /** Two-way bind a markdown string. */
  markdown?: string
  /** Two-way bind a PM JSON document. */
  json?: JSONContent
  /** User-defined Comark components (block or inline). */
  components?: ReadonlyArray<ComarkVueComponentExports>
  /** Additional Tiptap extensions (appended after the kit). */
  extensions?: ReadonlyArray<AnyExtension>
  /** Pass-through for `useComarkEditor` advanced options. */
  editorOptions?: UseComarkEditorOptions['editorOptions']
}

const props = withDefaults(defineProps<Props>(), {
  editor: undefined,
})

const emits = defineEmits<{
  /** v-model:ast — fired on every transaction that changes the document. */
  'update:ast': [tree: ComarkTree]
  /** v-model:markdown — fired on every transaction. */
  'update:markdown': [markdown: string]
  /** v-model:json — fired on every transaction. */
  'update:json': [json: JSONContent]
  /** Editor instance, fired once after construction. */
  'ready': [editor: Editor]
  /** Catch-all update event with the editor instance. */
  'update': [editor: Editor]
}>()

defineSlots<{
  default(props: { editor: Editor | undefined; isReady: boolean }): unknown
  fallback(): unknown
}>()

defineOptions({ inheritAttrs: false })

// JSON-shadow loop guard. Each direction stores the last serialized form
// it saw; equal-shadow writes are skipped. Cheap (PM docs are small) and
// it dodges the editor's reconstructed-AST identity problem.
let astShadow: string | null = null
let mdShadow: string | null = null
let jsonShadow: string | null = null

const safeJson = (v: unknown): string => {
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

// Pick the seed: any v-model wins over `initial` (an explicit binding is
// always the source of truth at mount time). HTML strings only seed via
// `initial` since they aren't a v-model flavor.
const seedAtMount: ComarkTree | JSONContent | string | undefined =
  props.ast ?? props.markdown ?? props.json ?? props.initial

const internal = props.editor
  ? null
  : useComarkEditor({
      initial: seedAtMount,
      components: props.components,
      extensions: props.extensions,
      editorOptions: props.editorOptions,
      onCreate: (e) => {
        // Initialize shadows from whatever just got into the editor so the
        // first onUpdate doesn't echo back as a fake change.
        if (props.ast !== undefined) {
          astShadow = safeJson(e.storage.comark.getAst())
        }
        if (props.json !== undefined) {
          jsonShadow = safeJson(e.getJSON())
        }
        if (props.markdown !== undefined) {
          // getMarkdown is async; seed the shadow once it resolves. Any
          // edit that lands before then will re-emit (acceptable — at
          // worst we send one redundant update at startup).
          e.storage.comark.getMarkdown().then((md) => {
            mdShadow = md
          })
        }
        emits('ready', e)
      },
      onUpdate: (e) => {
        emits('update', e)

        if (props.ast !== undefined) {
          const tree = e.storage.comark.getAst()
          const j = safeJson(tree)
          if (j !== astShadow) {
            astShadow = j
            emits('update:ast', tree)
          }
        }
        if (props.json !== undefined) {
          const json = e.getJSON() as JSONContent
          const j = safeJson(json)
          if (j !== jsonShadow) {
            jsonShadow = j
            emits('update:json', json)
          }
        }
        if (props.markdown !== undefined) {
          e.storage.comark
            .getMarkdown()
            .then((md) => {
              if (md !== mdShadow) {
                mdShadow = md
                emits('update:markdown', md)
              }
            })
            .catch(() => {
              /* swallow */
            })
        }
      },
    })

// Outside-in sync: when a bound prop changes from above, push it into
// the editor unless the shadow says we already have it.

watch(
  () => props.ast,
  (next) => {
    if (next === undefined || !internal) return
    const j = safeJson(next)
    if (j === astShadow) return
    astShadow = j
    internal.setAst(next)
  },
)

watch(
  () => props.markdown,
  (next) => {
    if (next === undefined || !internal) return
    if (next === mdShadow) return
    mdShadow = next
    void internal.setMarkdown(next)
  },
)

watch(
  () => props.json,
  (next) => {
    if (next === undefined || !internal) return
    const j = safeJson(next)
    if (j === jsonShadow) return
    jsonShadow = j
    internal.setJson(next)
  },
)

const editorRef = computed<Editor | undefined>(
  () => props.editor ?? (internal?.editor.value as Editor | undefined),
)
// `EditorContent`'s prop is typed against `@tiptap/vue-3`'s Editor (a
// structural superset of core's). Same instance at runtime; just a type-
// level coercion so the template binds cleanly.
const editorForView = computed<VueEditor | undefined>(
  () => editorRef.value as VueEditor | undefined,
)
const isReady = computed(() => editorRef.value !== undefined)

defineExpose({
  /** Tiptap editor instance (reactive). */
  editor: editorRef,
  /** Imperative setters / getters from the underlying composable. */
  setAst: internal?.setAst,
  setMarkdown: internal?.setMarkdown,
  setJson: internal?.setJson,
  getAst: internal?.getAst,
  getMarkdown: internal?.getMarkdown,
  getJson: internal?.getJson,
})
</script>

<template>
  <div data-comark-editor>
    <slot :editor="editorRef" :is-ready="isReady" />
    <EditorContent
      v-if="editorForView"
      :editor="editorForView"
      data-comark-editor-content
      v-bind="$attrs"
    />
    <slot v-else name="fallback" />
  </div>
</template>
