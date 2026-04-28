/**
 * `useComarkEditor` — composable returning a pre-wired Tiptap editor.
 *
 *   const { editor, getAst, setAst } = useComarkEditor({
 *     initial: tree,
 *     components: [Alert],
 *   })
 *
 * State ownership is yours: this composable doesn't bind to your refs.
 * You read with `getAst` / `getMarkdown` / `getJson` (typically inside
 * `onUpdate`) and write with `setAst` / `setMarkdown` / `setJson`. Each
 * setter accepts either a value or a `({ content, editor }) => next`
 * functional-update callback for advanced use cases.
 *
 * `components` and `extensions` are read once at mount — non-reactive on
 * purpose. Tiptap's editor schema is stamped at construction; rebuilding
 * to swap an extension is too costly for the rare cases where it'd be
 * useful. If you genuinely need a different extension set, build a fresh
 * editor (typically by re-keying the `<ComarkEditor>` host).
 *
 * `initial` is also read once at mount; the name is deliberate. Use the
 * setters to push new content after the fact.
 */

import type { AnyExtension, Content, EditorOptions } from '@tiptap/core'
import { Editor } from '@tiptap/vue-3'
import { ComarkKit, type ComarkTree, type JSONContent } from 'tiptap-comark'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
} from 'vue'
import type { ComarkVueComponentExports } from './define-component'

export interface UseComarkEditorOptions {
  /**
   * Initial document. Read once at mount; not reactive. Accepts a Comark
   * AST (`{ nodes, frontmatter, meta }`), PM JSON, or an HTML/text string.
   * To replace content reactively after mount, call `setAst` /
   * `setMarkdown` / `setJson`.
   */
  initial?: ComarkTree | JSONContent | string

  /** User-defined Comark components (block or inline). Read once at mount. */
  components?: ReadonlyArray<ComarkVueComponentExports>

  /** Additional Tiptap extensions, appended after the kit. Read once at mount. */
  extensions?: ReadonlyArray<AnyExtension>

  /**
   * Forwarded to Tiptap's `Editor` constructor. Use it for `editorProps`,
   * `editable`, `injectCSS`, custom `parseOptions`, etc. Schema-related
   * options (extensions, content) and lifecycle hooks (onCreate /
   * onUpdate / onDestroy) are managed by this composable.
   */
  editorOptions?: Omit<
    Partial<EditorOptions>,
    'extensions' | 'content' | 'onCreate' | 'onUpdate' | 'onDestroy'
  >

  /** Called once when the editor instance has been created. */
  onCreate?: (editor: Editor) => void
  /** Called on every transaction that changes the document. */
  onUpdate?: (editor: Editor) => void
  /** Called when the editor instance is being destroyed. */
  onDestroy?: () => void
}

/**
 * Setter context — passed to the functional-update form of `setAst` /
 * `setMarkdown` / `setJson`. Lets the caller derive the next value from
 * the current state without an extra `getAst()` round-trip.
 */
export interface SetterContext<T> {
  /** Current content in the setter's flavor. */
  content: T
  /** The live editor instance. */
  editor: Editor
}

/** A direct value or a functional update of the current state. */
export type SetterInput<T> = T | ((ctx: SetterContext<T>) => T)
/** Async-aware variant for markdown (where reading is async). */
export type AsyncSetterInput<T> = T | ((ctx: SetterContext<T>) => T | Promise<T>)

export interface UseComarkEditorReturn {
  /** Tiptap editor instance. `undefined` until mount. */
  editor: ShallowRef<Editor | undefined>
  /** True once the editor instance is constructed. */
  isReady: ComputedRef<boolean>

  /** Replace content from a Comark AST (or derive it from the current state). */
  setAst: (input: SetterInput<ComarkTree>) => void
  /** Replace content from markdown (or derive it from the current state). */
  setMarkdown: (input: AsyncSetterInput<string>) => Promise<void>
  /** Replace content from PM JSON (or derive it from the current state). */
  setJson: (input: SetterInput<JSONContent>) => void

  /** Read the current state in any flavor. Returns `null` until ready. */
  getAst: () => ComarkTree | null
  getMarkdown: () => Promise<string | null>
  getJson: () => JSONContent | null
}

export function useComarkEditor(options: UseComarkEditorOptions = {}): UseComarkEditorReturn {
  const {
    initial,
    components = [],
    extensions = [],
    editorOptions,
    onCreate,
    onUpdate,
    onDestroy,
  } = options

  const editor = shallowRef<Editor | undefined>(undefined)

  const allExtensions = [...ComarkKit, ...components.map((c) => c.extension), ...extensions]

  // PM JSON / HTML strings can seed Tiptap directly. Comark trees go
  // through `setComarkAst` post-construct (Tiptap doesn't know about the
  // tuple shape).
  const initialContent: Content | undefined = isComarkTreeLike(initial)
    ? undefined
    : (initial as Content | undefined)

  // Tiptap touches the DOM during construction — defer to client mount.
  onMounted(() => {
    const instance = new Editor({
      ...editorOptions,
      extensions: allExtensions,
      content: initialContent,
      onCreate({ editor: e }) {
        if (isComarkTreeLike(initial)) {
          e.commands.setComarkAst(initial as ComarkTree)
        }
        onCreate?.(e as Editor)
      },
      onUpdate({ editor: e }) {
        onUpdate?.(e as Editor)
      },
      onDestroy() {
        onDestroy?.()
      },
    })

    editor.value = instance
  })

  onBeforeUnmount(() => {
    editor.value?.destroy()
  })

  // -------------------------------------------------------------------
  // Setters — direct value or functional-update callback
  // -------------------------------------------------------------------

  const setAst = (input: SetterInput<ComarkTree>): void => {
    const e = editor.value
    if (!e) return
    const next =
      typeof input === 'function' ? input({ content: e.storage.comark.getAst(), editor: e }) : input
    e.commands.setComarkAst(next)
  }

  const setMarkdown = async (input: AsyncSetterInput<string>): Promise<void> => {
    const e = editor.value
    if (!e) return
    let next: string
    if (typeof input === 'function') {
      const current = await e.storage.comark.getMarkdown()
      next = await input({ content: current, editor: e })
    } else {
      next = input
    }
    e.commands.setComarkMarkdown(next)
  }

  const setJson = (input: SetterInput<JSONContent>): void => {
    const e = editor.value
    if (!e) return
    const next =
      typeof input === 'function'
        ? input({ content: e.getJSON() as JSONContent, editor: e })
        : input
    e.commands.setContent(next as Content, { emitUpdate: true })
  }

  // -------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------

  const getAst = (): ComarkTree | null => editor.value?.storage.comark.getAst() ?? null
  const getMarkdown = (): Promise<string | null> =>
    editor.value?.storage.comark.getMarkdown() ?? Promise.resolve(null)
  const getJson = (): JSONContent | null =>
    (editor.value?.getJSON() as JSONContent | undefined) ?? null

  const isReady = computed(() => editor.value !== undefined)

  return { editor, isReady, setAst, setMarkdown, setJson, getAst, getMarkdown, getJson }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isComarkTreeLike(v: unknown): v is ComarkTree {
  return (
    !!v &&
    typeof v === 'object' &&
    'nodes' in (v as Record<string, unknown>) &&
    Array.isArray((v as { nodes: unknown }).nodes)
  )
}
