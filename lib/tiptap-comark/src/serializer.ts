/**
 * The orchestrator. Two halves:
 *
 *   1. `createSerializer({ nodes, marks })` — pure function that returns a
 *      `ComarkHelpers` bag. Each node/mark spec is wired into dispatch
 *      tables (PM-name → spec, comark-tag → spec). Recursion helpers
 *      (`serializeBlocks` etc.) call back into the right spec for each
 *      child. Pure data-in / data-out — no DOM, no Tiptap editor required.
 *
 *   2. `ComarkSerializer` — a Tiptap extension that, at runtime, collects
 *      every other extension's `comark` storage spec and exposes the same
 *      helpers via `editor.storage.comark.{getAst,getMarkdown,…}`.
 *
 * The two halves share dispatch logic: the extension just hands its
 * collected specs to `createSerializer`.
 */

import { Extension, type AnyExtension, type Editor, type JSONContent } from '@tiptap/core'
import { parse } from 'comark'
import { renderMarkdown } from 'comark/render'
import { injectComarkStyles } from './style'
import type {
  ComarkComment,
  ComarkElement,
  ComarkHelpers,
  ComarkNode,
  ComarkTree,
  MarkSpec,
  NodeSpec,
  PMMark,
} from './types'

// ===========================================================================
// Pure dispatcher
// ===========================================================================

export interface SerializerSpecs {
  nodes: readonly NodeSpec[]
  marks: readonly MarkSpec[]
}

const TEXT_PM_NAME = 'text'
const DOC_PM_NAME = 'doc'

const isComarkText = (n: ComarkNode): n is string => typeof n === 'string'
const isComarkComment = (n: ComarkNode): n is ComarkComment => Array.isArray(n) && n[0] === null
const isComarkElement = (n: ComarkNode): n is ComarkElement =>
  Array.isArray(n) && typeof n[0] === 'string'

/**
 * Build the recursion helpers from a flat list of node / mark specs. Pure
 * function — call it once and reuse the helpers.
 */
export function createSerializer(specs: SerializerSpecs): ComarkHelpers {
  const nodeByPmName = new Map<string, NodeSpec>()
  const nodeByTag = new Map<string, NodeSpec[]>()
  const markByPmName = new Map<string, MarkSpec>()
  const markByTag = new Map<string, MarkSpec[]>()

  for (const spec of specs.nodes) {
    nodeByPmName.set(spec.pmName, spec)
    for (const tag of spec.tags) {
      const list = nodeByTag.get(tag) ?? []
      list.push(spec)
      nodeByTag.set(tag, list)
    }
  }
  for (const spec of specs.marks) {
    markByPmName.set(spec.pmName, spec)
    for (const tag of spec.tags) {
      const list = markByTag.get(tag) ?? []
      list.push(spec)
      markByTag.set(tag, list)
    }
  }

  function pickNodeForTag(el: ComarkElement): NodeSpec | undefined {
    const candidates = nodeByTag.get(el[0])
    if (!candidates) return undefined
    if (candidates.length === 1) return candidates[0]
    return candidates.find((c) => !c.matches || c.matches(el)) ?? candidates[0]
  }

  function pickMarkForTag(el: ComarkElement): MarkSpec | undefined {
    const candidates = markByTag.get(el[0])
    if (!candidates) return undefined
    return candidates[0]
  }

  /**
   * Is a Comark element inline-context? True for marks (always inline) and
   * for any node spec that declared `context: 'inline'` (hardBreak, image,
   * inline-kind components).
   */
  function isInlineComarkElement(el: ComarkElement): boolean {
    if (pickMarkForTag(el)) return true
    const node = pickNodeForTag(el)
    return node?.context === 'inline'
  }

  // -------------------------------------------------------------------
  // PM JSON → Comark
  // -------------------------------------------------------------------

  function serializeBlocks(content: JSONContent[] | undefined): ComarkNode[] {
    if (!content) return []
    const out: ComarkNode[] = []
    for (const child of content) {
      if (!child.type) continue
      const spec = nodeByPmName.get(child.type)
      if (!spec) continue
      const result = spec.toComark(child, helpers)
      if (result !== null && result !== undefined) out.push(result)
    }
    return out
  }

  function serializeInlines(content: JSONContent[] | undefined): ComarkNode[] {
    if (!content) return []
    const out: ComarkNode[] = []
    for (const child of content) {
      if (!child.type) continue

      // Text gets wrapped by its marks. PM stores marks outer-first
      // (matches `DOMParser.fromSchema(...).parse()`'s convention; the
      // mark at index 0 is the outermost in the source DOM). To produce
      // `<strong><em>X</em></strong>` we must wrap with the LAST mark
      // first (innermost) and the FIRST mark last (outermost), hence the
      // reverse iteration. `parseInlines` prepends new marks for the
      // same reason — both directions agree on outer-first.
      if (child.type === TEXT_PM_NAME) {
        const text = child.text ?? ''
        if (text.length === 0) continue
        const marks = (child.marks ?? []) as PMMark[]
        let inner: ComarkNode = text
        for (let i = marks.length - 1; i >= 0; i--) {
          const m = marks[i]
          if (!m) continue
          const spec = markByPmName.get(m.type)
          if (!spec) continue
          inner = spec.toComark(m, inner)
        }
        out.push(inner)
        continue
      }

      // Inline atom (image, hardBreak, inline component) — the spec emits
      // its own Comark element. Marks on inline atoms wrap that element
      // outer-first, same convention as text-run marks.
      const spec = nodeByPmName.get(child.type)
      if (!spec) continue
      const result = spec.toComark(child, helpers)
      if (result === null || result === undefined) continue
      let wrapped: ComarkNode = result
      const atomMarks = (child.marks ?? []) as PMMark[]
      for (let i = atomMarks.length - 1; i >= 0; i--) {
        const m = atomMarks[i]
        if (!m) continue
        const ms = markByPmName.get(m.type)
        if (!ms) continue
        wrapped = ms.toComark(m, wrapped)
      }
      out.push(wrapped)
    }
    return out
  }

  // -------------------------------------------------------------------
  // Comark → PM JSON
  // -------------------------------------------------------------------

  function parseBlocks(children: ComarkNode[]): JSONContent[] {
    const out: JSONContent[] = []
    let inlineBuf: ComarkNode[] = []

    const flushInlines = () => {
      if (inlineBuf.length === 0) return
      const inlines = parseInlines(inlineBuf)
      if (inlines.length > 0) {
        out.push({ type: 'paragraph', content: inlines })
      }
      inlineBuf = []
    }

    for (const child of children) {
      if (isComarkText(child)) {
        // A bare text at block level — Comark's autoUnwrap omits the
        // paragraph wrapper when a container has a single paragraph child.
        // We bucket consecutive inlines together so they land in one
        // paragraph, not a paragraph each.
        if (child.length === 0) continue
        inlineBuf.push(child)
        continue
      }
      if (isComarkComment(child)) {
        flushInlines()
        const spec = nodeByPmName.get('comarkComment')
        if (spec) {
          const result = spec.fromComark(child as unknown as ComarkElement, helpers)
          if (result) out.push(result)
        }
        continue
      }
      if (!isComarkElement(child)) continue

      // Inline element (mark or inline-context node)? Buffer it.
      if (isInlineComarkElement(child)) {
        inlineBuf.push(child)
        continue
      }

      // Block element — flush whatever inlines we accumulated, then emit.
      flushInlines()
      const spec = pickNodeForTag(child)
      if (!spec) continue
      const result = spec.fromComark(child, helpers)
      if (result) out.push(result)
    }

    flushInlines()
    return out
  }

  function parseInlines(children: ComarkNode[]): JSONContent[] {
    const out: JSONContent[] = []
    for (const child of children) {
      if (isComarkText(child)) {
        if (child.length === 0) continue
        out.push({ type: 'text', text: child })
        continue
      }
      if (isComarkComment(child)) {
        // Comments inside inline runs are unusual; drop them silently.
        continue
      }
      if (!isComarkElement(child)) continue

      // Mark? Recurse into its children with the mark layered on.
      const markSpec = pickMarkForTag(child)
      if (markSpec) {
        const mark = markSpec.fromComark(child)
        if (!mark) continue
        const innerChildren = child.slice(2) as ComarkNode[]
        const innerJson = parseInlines(innerChildren)
        for (const j of innerJson) {
          // Prepend the new mark — at this point it's the OUTERMOST one
          // we've seen for this text run (we're unwinding the recursion
          // from the inside out). Outer-first ordering matches PM's
          // DOM-parser convention; `serializeInlines` wraps in reverse.
          const existing = (j.marks ?? []) as PMMark[]
          out.push({ ...j, marks: [mark, ...existing] })
        }
        continue
      }

      // Inline node (img, hardBreak, custom inline component)?
      const nodeSpec = pickNodeForTag(child)
      if (!nodeSpec) {
        // Unknown — splat the children as a last-resort lossy fallback so
        // the user at least sees the text. The kit covers everything
        // Comark emits, so this only fires for AST authored by hand with
        // unrecognized tags.
        const innerChildren = child.slice(2) as ComarkNode[]
        out.push(...parseInlines(innerChildren))
        continue
      }
      const json = nodeSpec.fromComark(child, helpers)
      if (json) out.push(json)
    }
    return out
  }

  const helpers: ComarkHelpers = {
    serializeBlocks,
    serializeInlines,
    parseBlocks,
    parseInlines,
    nodeSpecs: specs.nodes,
    markSpecs: specs.marks,
  }
  return helpers
}

// ===========================================================================
// Doc-level convenience
// ===========================================================================

/**
 * Convert a PM doc JSON to a Comark tree using the given helpers.
 *
 * `frontmatter` and `meta` are caller-supplied — the editor doesn't own
 * them, so we just pass them through.
 */
export function pmDocToComark(
  doc: JSONContent,
  helpers: ComarkHelpers,
  carry: { frontmatter?: Record<string, unknown>; meta?: Record<string, unknown> } = {},
): ComarkTree {
  if (doc.type !== DOC_PM_NAME) {
    throw new Error(`Expected PM doc node, got "${doc.type}"`)
  }
  return {
    nodes: helpers.serializeBlocks(doc.content),
    frontmatter: { ...carry.frontmatter },
    meta: { ...carry.meta },
  }
}

/** Convert a Comark tree to a PM doc JSON using the given helpers. */
export function comarkToPmDoc(tree: ComarkTree, helpers: ComarkHelpers): JSONContent {
  const content = helpers.parseBlocks(tree.nodes)
  return {
    type: DOC_PM_NAME,
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  }
}

// ===========================================================================
// Tiptap extension — wires the orchestrator to a live editor
// ===========================================================================

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comark: {
      /** Replace editor content from a Comark AST. */
      setComarkAst: (tree: ComarkTree) => ReturnType
      /** Replace editor content from a markdown string (parses via comark). */
      setComarkMarkdown: (markdown: string) => ReturnType
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Storage {
    comark: ComarkSerializerStorage
  }
}

export interface ComarkSerializerStorage {
  /** The dispatch helpers built from the registered extensions. */
  helpers: ComarkHelpers | null
  /** External frontmatter / meta the editor doesn't own. */
  frontmatter: Record<string, unknown>
  meta: Record<string, unknown>
  /**
   * Editor instance, populated on `onCreate`. Internal — use `getAst` /
   * `getMarkdown` rather than reaching into this directly.
   */
  editor: Editor | null
  /** Read the editor's current content as a Comark AST. */
  getAst(): ComarkTree
  /** Read the editor's current content as Comark markdown. */
  getMarkdown(): Promise<string>
}

export interface ComarkSerializerOptions {
  /**
   * Auto-inject the kit's operational stylesheet (`comarkStyle`) into
   * `document.head` on editor creation. Mirrors `@tiptap/core`'s own
   * `injectCSS` option both in name shape and in dedup behavior — a
   * single `<style data-comark-style>` tag is shared across every
   * editor in the document.
   *
   * Set to `false` if a host (e.g. Nuxt UI) ships its own complete
   * stylesheet for the kit's markers, or if the consumer wants to
   * inject `comarkStyle` themselves with a CSP nonce / Shadow DOM /
   * scoped pipeline.
   *
   * @default true
   */
  injectStyles: boolean

  /**
   * CSP nonce applied to the auto-injected style tag. Mirrors Tiptap
   * core's `injectNonce`. Ignored when `injectStyles` is `false`.
   *
   * @default undefined
   */
  injectNonce?: string
}

export const ComarkSerializer = Extension.create<ComarkSerializerOptions, ComarkSerializerStorage>({
  name: 'comark',

  addOptions() {
    return {
      injectStyles: true,
      injectNonce: undefined,
    }
  },

  addStorage(): ComarkSerializerStorage {
    return {
      helpers: null,
      frontmatter: {},
      meta: {},
      editor: null,
      getAst(this: ComarkSerializerStorage): ComarkTree {
        if (!this.editor) throw new Error('[comark] editor not yet attached')
        const helpers = ensureHelpers(this.editor)
        return pmDocToComark(this.editor.getJSON() as JSONContent, helpers, {
          frontmatter: this.frontmatter,
          meta: this.meta,
        })
      },
      async getMarkdown(this: ComarkSerializerStorage): Promise<string> {
        const tree = this.getAst()
        return await renderMarkdown(tree)
      },
    }
  },

  onBeforeCreate() {
    // Stash the editor on storage as early as possible — `setComarkAst`
    // fired from a host's `onCreate` callback dispatches a transaction
    // before our extension's own `onCreate` would run, so we set up here.
    this.storage.editor = this.editor

    // Inject the operational stylesheet at the same point Tiptap core
    // injects its own (during construction, before any transaction).
    // `injectComarkStyles` is a no-op when `document` is undefined, so
    // this is safe in SSR / Node test runners.
    if (this.options.injectStyles) {
      injectComarkStyles(this.options.injectNonce)
    }
  },

  addCommands() {
    return {
      setComarkAst:
        (tree: ComarkTree) =>
        ({ commands }) => {
          const helpers = ensureHelpers(this.editor)
          this.storage.frontmatter = { ...tree.frontmatter }
          this.storage.meta = { ...tree.meta }
          const doc = comarkToPmDoc(tree, helpers)
          return commands.setContent(doc, { emitUpdate: true })
        },
      setComarkMarkdown:
        (markdown: string) =>
        ({ commands }) => {
          // Dispatch synchronously so the Tiptap chain composes; the parse
          // is async and the result is applied on resolution. Returns true
          // optimistically — failure is logged via console.warn.
          parse(markdown)
            .then((tree) => {
              commands.setComarkAst(tree)
            })
            .catch((err) => {
              if (typeof console !== 'undefined') {
                console.warn('[comark] setComarkMarkdown parse failed:', err)
              }
            })
          return true
        },
    }
  },
})

/**
 * Look up every extension's `storage.comark` spec and build helpers from
 * them. Cached on the serializer's own storage so we only walk extensions
 * once per editor (until `recomputeHelpers` is called).
 */
function ensureHelpers(editor: Editor): ComarkHelpers {
  const storage = editor.storage.comark as ComarkSerializerStorage | undefined
  if (storage?.helpers) return storage.helpers
  const helpers = collectHelpers(editor.extensionManager.extensions)
  if (storage) storage.helpers = helpers
  return helpers
}

/**
 * Pull `nodeSpec` / `markSpec` out of every extension's storage and feed
 * them to `createSerializer`.
 */
export function collectHelpers(extensions: readonly AnyExtension[]): ComarkHelpers {
  const nodes: NodeSpec[] = []
  const marks: MarkSpec[] = []
  for (const ext of extensions) {
    const spec = (ext.storage as { comark?: NodeSpec | MarkSpec } | undefined)?.comark
    if (!spec) continue
    if (ext.type === 'node') nodes.push(spec as NodeSpec)
    else if (ext.type === 'mark') marks.push(spec as MarkSpec)
  }
  return createSerializer({ nodes, marks })
}
