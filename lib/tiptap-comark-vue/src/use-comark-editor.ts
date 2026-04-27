/**
 * `useComarkEditor` — composable returning a pre-wired Tiptap editor.
 *
 *   const tree = ref<ComarkTree>({ nodes: [], frontmatter: {}, meta: {} })
 *   const { editor } = useComarkEditor({ ast: tree, components: [Alert] })
 *
 * The composable always installs `ComarkKit` (the complete Comark schema
 * from `tiptap-comark`) plus any user components or extra Tiptap
 * extensions. Three optional model bindings — `ast`, `markdown`, and
 * `json` — keep an external ref in sync with the editor in either
 * direction. Bind whichever flavor your app actually stores.
 *
 * Loop guard: each direction maintains a "last seen serialized" snapshot
 * (`shadow`). Writes that match the current shadow are skipped. The
 * editor reconstructs the AST on every `getAst()` so reference identity
 * isn't a usable signal — structural equality via `JSON.stringify` is
 * what we have, and PM docs are small enough that the cost is fine.
 */

import { type AnyExtension, type Content, type Editor } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import { ComarkKit, type ComarkTree, type JSONContent } from 'tiptap-comark'
import { computed, onBeforeUnmount, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import type { ComarkVueComponentExports } from './define-component'

export type ComarkEditorContentType = 'ast' | 'markdown' | 'json'

export interface UseComarkEditorOptions {
  /**
   * Initial editor content. Markdown string, Comark AST, or PM JSON —
   * whatever you have. Ignored when a model ref (`ast`/`markdown`/`json`)
   * is also bound: the model's current value seeds the editor instead.
   */
  content?: ComarkTree | JSONContent | string

  /** User-defined Comark components (block or inline). */
  components?: ReadonlyArray<ComarkVueComponentExports>

  /** Additional Tiptap extensions — appended after the kit. */
  extensions?: ReadonlyArray<AnyExtension>

  /** Two-way bind a `Ref<ComarkTree>`. */
  ast?: Ref<ComarkTree>
  /** Two-way bind a `Ref<string>` of markdown. */
  markdown?: Ref<string>
  /** Two-way bind a `Ref<JSONContent>` of PM JSON. */
  json?: Ref<JSONContent>

  /**
   * Forwarded to Tiptap's `useEditor`. Use it for custom keymaps,
   * decorations, etc. Schema-related options (extensions, content) are
   * managed by this composable.
   *
   * Typed as the actual `useEditor` argument shape (which is a superset of
   * `@tiptap/core`'s `EditorOptions` — it adds Vue-specific knobs like
   * `immediatelyRender`).
   */
  editorOptions?: Omit<
    NonNullable<Parameters<typeof useEditor>[0]>,
    'extensions' | 'content' | 'onCreate' | 'onUpdate' | 'onDestroy'
  >

  /** Lifecycle hooks. */
  onCreate?: (editor: Editor) => void
  onUpdate?: (editor: Editor) => void
  onDestroy?: () => void
}

export interface UseComarkEditorReturn {
  /** Tiptap editor instance. `undefined` until the component mounts. */
  editor: ShallowRef<Editor | undefined>
  /** True once Tiptap has constructed the editor instance. */
  isReady: ComputedRef<boolean>
  /** Imperative setters — work whether or not a model ref is bound. */
  setAst: (tree: ComarkTree) => void
  setMarkdown: (markdown: string) => void
  setJson: (json: JSONContent) => void
  /** Read the current state in any flavor. */
  getAst: () => ComarkTree | null
  getMarkdown: () => Promise<string | null>
  getJson: () => JSONContent | null
}

export function useComarkEditor(options: UseComarkEditorOptions = {}): UseComarkEditorReturn {
  const {
    components = [],
    extensions = [],
    ast,
    markdown,
    json,
    content,
    editorOptions,
    onCreate,
    onUpdate,
    onDestroy,
  } = options

  // Per-direction "last seen" snapshots — structural equality dedup so
  // a write doesn't echo back as a fake update.
  let astShadow: string | null = ast ? safeJson(ast.value) : null
  let jsonShadow: string | null = json ? safeJson(json.value) : null
  let mdShadow: string | null = markdown?.value ?? null

  const allExtensions = [...ComarkKit, ...components.map((c) => c.extension), ...extensions]

  // PM JSON can seed Tiptap directly. AST and markdown need the editor
  // instance to call `setComarkAst` / `setComarkMarkdown` against, so we
  // defer those into `onCreate`.
  const initialContent = resolveInitialContent({ json, content })

  const editor = useEditor({
    ...editorOptions,
    extensions: allExtensions,
    content: initialContent,
    onCreate({ editor: instance }) {
      // Seed from bound model first; fall back to static `content`.
      if (ast?.value && ast.value.nodes.length > 0) {
        astShadow = safeJson(ast.value)
        instance.commands.setComarkAst(ast.value)
      } else if (markdown?.value) {
        mdShadow = markdown.value
        instance.commands.setComarkMarkdown(markdown.value)
      } else if (content && typeof content === 'object' && 'nodes' in content) {
        instance.commands.setComarkAst(content as ComarkTree)
      }
      onCreate?.(instance)
    },
    onUpdate({ editor: instance }) {
      onUpdate?.(instance)

      // Push current state back to whichever model ref the user bound.
      if (ast) {
        const tree = instance.storage.comark.getAst()
        const j = safeJson(tree)
        if (j !== astShadow) {
          astShadow = j
          ast.value = tree
        }
      }
      if (json) {
        const j = instance.getJSON() as JSONContent
        const s = safeJson(j)
        if (s !== jsonShadow) {
          jsonShadow = s
          json.value = j
        }
      }
      if (markdown) {
        // Markdown is async; fire-and-forget. Errors are non-fatal.
        instance.storage.comark
          .getMarkdown()
          .then((md: string) => {
            if (md !== mdShadow) {
              mdShadow = md
              markdown.value = md
            }
          })
          .catch(() => {
            /* swallow */
          })
      }
    },
    onDestroy() {
      onDestroy?.()
    },
  })

  // -------------------------------------------------------------------
  // External-source → editor watchers
  // -------------------------------------------------------------------

  if (ast) {
    watch(ast, (tree) => {
      const j = safeJson(tree)
      if (j === astShadow) return
      astShadow = j
      editor.value?.commands.setComarkAst(tree)
    })
  }

  if (markdown) {
    watch(markdown, (md) => {
      if (md === mdShadow) return
      mdShadow = md
      editor.value?.commands.setComarkMarkdown(md)
    })
  }

  if (json) {
    watch(json, (j) => {
      const s = safeJson(j)
      if (s === jsonShadow) return
      jsonShadow = s
      editor.value?.commands.setContent(j as Content, { emitUpdate: false })
    })
  }

  onBeforeUnmount(() => {
    editor.value?.destroy()
  })

  // -------------------------------------------------------------------
  // Imperative setters / getters
  // -------------------------------------------------------------------

  const isReady = computed(() => editor.value !== undefined)

  const setAst = (tree: ComarkTree) => {
    editor.value?.commands.setComarkAst(tree)
  }
  const setMarkdown = (md: string) => {
    editor.value?.commands.setComarkMarkdown(md)
  }
  const setJson = (j: JSONContent) => {
    editor.value?.commands.setContent(j as Content, { emitUpdate: true })
  }

  const getAst = (): ComarkTree | null => editor.value?.storage.comark.getAst() ?? null
  const getMarkdown = (): Promise<string | null> =>
    editor.value?.storage.comark.getMarkdown() ?? Promise.resolve(null)
  const getJson = (): JSONContent | null =>
    (editor.value?.getJSON() as JSONContent | undefined) ?? null

  return { editor, isReady, setAst, setMarkdown, setJson, getAst, getMarkdown, getJson }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveInitialContent(opts: {
  json?: Ref<JSONContent>
  content?: ComarkTree | JSONContent | string
}): Content | undefined {
  if (opts.json) return opts.json.value as Content
  if (typeof opts.content === 'string') return opts.content
  if (opts.content && typeof opts.content === 'object' && 'nodes' in opts.content) {
    // It's a Comark tree — leave the editor empty here; `onCreate` will
    // call `setComarkAst` once the instance exists.
    return undefined
  }
  return opts.content as Content | undefined
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}
