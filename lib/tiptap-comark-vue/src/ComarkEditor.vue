<!--
  ComarkEditor.vue — thin wrapper around Tiptap's `EditorContent`.

  Two usage modes:

  1. **Self-contained**: pass any of `v-model:ast`, `v-model:markdown`, or
     `v-model:json` and the component creates its own Tiptap editor wired
     up via `useComarkEditor`. The default slot receives the editor + ready
     state so you can build a toolbar.

  2. **Bring-your-own-editor**: pass `:editor="myEditor"` (from your own
     `useComarkEditor` call) and the component is purely a presentational
     wrapper around the editor's content. Use this when you need direct
     access to the editor before/after mount, want one editor across
     multiple `<ComarkEditor>` instances (rare), or want to keep editor
     ownership in the parent.

  Components and extra extensions can be passed in either mode.
-->

<script setup lang="ts">
import { EditorContent, type Editor } from '@tiptap/vue-3'
import type { AnyExtension } from '@tiptap/core'
import { computed } from 'vue'
import type { ComarkTree, JSONContent } from 'tiptap-comark'
import { useComarkEditor, type UseComarkEditorOptions } from './use-comark-editor'
import type { ComarkVueComponentExports } from './define-component'

interface Props {
  /** Bring-your-own editor instance (skips internal `useComarkEditor`). */
  editor?: Editor | undefined
  /** User-defined Comark components. Ignored when `editor` is provided. */
  components?: ReadonlyArray<ComarkVueComponentExports>
  /** Additional Tiptap extensions. Ignored when `editor` is provided. */
  extensions?: ReadonlyArray<AnyExtension>
  /** Initial content (string = HTML; object with `nodes` = Comark AST). */
  content?: ComarkTree | JSONContent | string
  /** Two-way model bindings — bind whichever flavor your app stores. */
  ast?: ComarkTree
  markdown?: string
  json?: JSONContent
  /** Pass-through for `useComarkEditor` advanced options. */
  editorOptions?: UseComarkEditorOptions['editorOptions']
}

const props = withDefaults(defineProps<Props>(), {
  editor: undefined,
})

const emits = defineEmits<{
  'update:ast': [tree: ComarkTree]
  'update:markdown': [markdown: string]
  'update:json': [json: JSONContent]
}>()

defineSlots<{
  default(props: { editor: Editor | undefined; isReady: boolean }): unknown
  fallback(): unknown
}>()

defineOptions({ inheritAttrs: false })

// When the user supplies their own editor, we don't construct one. Otherwise
// build it via the composable. Each model flavor only triggers a `v-model`
// emit when actually bound — the parent's `v-model:ast` / `v-model:markdown`
// / `v-model:json` hookup decides which one.
const astModel = computed<ComarkTree | undefined>({
  get: () => props.ast,
  set: (v) => emits('update:ast', v as ComarkTree),
})
const mdModel = computed<string | undefined>({
  get: () => props.markdown,
  set: (v) => emits('update:markdown', v as string),
})
const jsonModel = computed<JSONContent | undefined>({
  get: () => props.json,
  set: (v) => emits('update:json', v as JSONContent),
})

const internal = props.editor
  ? null
  : useComarkEditor({
      components: props.components,
      extensions: props.extensions,
      content: props.content,
      ast: 'ast' in props && props.ast !== undefined ? (astModel as never) : undefined,
      markdown:
        'markdown' in props && props.markdown !== undefined ? (mdModel as never) : undefined,
      json: 'json' in props && props.json !== undefined ? (jsonModel as never) : undefined,
      editorOptions: props.editorOptions,
    })

const editorRef = computed<Editor | undefined>(() => props.editor ?? internal?.editor.value)
const isReady = computed(() => editorRef.value !== undefined)

defineExpose({ editor: editorRef })
</script>

<template>
  <div data-comark-editor>
    <slot :editor="editorRef" :is-ready="isReady" />
    <EditorContent
      v-if="editorRef"
      :editor="editorRef"
      data-comark-editor-content
      v-bind="$attrs"
    />
    <slot v-else name="fallback" />
  </div>
</template>
