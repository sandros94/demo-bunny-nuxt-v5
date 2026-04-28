/**
 * Public API for `tiptap-comark-vue`.
 *
 * Three layers, by what consumers most often want:
 *
 *   1. `<ComarkEditor>` — drop-in component with v-model bindings.
 *   2. `useComarkEditor()` — composable for full editor control.
 *   3. `defineComarkVueComponent()` — Vue NodeView factory for your own
 *      `::alert` / `:badge` style components.
 */

export { default as ComarkEditor } from './ComarkEditor.vue'

export {
  useComarkEditor,
  type AsyncSetterInput,
  type SetterContext,
  type SetterInput,
  type UseComarkEditorOptions,
  type UseComarkEditorReturn,
} from './use-comark-editor'

export {
  defineComarkVueComponent,
  type ComarkVueComponentDefinition,
  type ComarkVueComponentExports,
} from './define-component'

// Re-export the vue-3 `Editor` class so consumers building their own
// editor outside `useComarkEditor` (the bring-your-own-editor mode of
// `<ComarkEditor>`) don't have to add a direct dependency on
// `@tiptap/vue-3` just to get the right type. Anything else from
// `@tiptap/vue-3` still imports cleanly from there.
export { Editor } from '@tiptap/vue-3'

// Re-export the types most users will need from `tiptap-comark` so they
// don't have to import from two packages for a basic setup. `ComarkComment`
// in `tiptap-comark` is the Tiptap extension; the underlying tuple type is
// exposed there as `ComarkCommentTuple` and we mirror that here.
export type {
  ComarkCommentTuple,
  ComarkElement,
  ComarkElementAttributes,
  ComarkNode,
  ComarkText,
  ComarkTree,
  JSONContent,
  PMMark,
} from 'tiptap-comark'
