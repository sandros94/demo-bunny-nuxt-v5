/**
 * `ComarkComponent` — factory for user-defined Comark components like
 * `::alert{type="info"}` (block) and `:badge[New]{color="green"}` (inline).
 *
 * Each call to `defineComarkComponent({ name, kind, … })` returns a
 * `{ extension, spec }` pair that can be added to the kit.
 *
 *   const Alert = defineComarkComponent({
 *     name: 'alert',
 *     kind: 'block',
 *     props: { type: 'string', title: 'string' }, // schema-validated keys
 *     nodeView: AlertNodeView,
 *   })
 *
 *   const editor = new Editor({
 *     extensions: [...ComarkKit, Alert.extension],
 *   })
 *
 * Component schema-validated props are first-class native PM attrs, so a
 * strict zod/valibot schema can't drop them. The leftover Comark element
 * attrs (class, id, data-*, custom) ride on `htmlAttrs` like any other
 * extension.
 */

import { Node, mergeAttributes, type Node as TiptapNode } from '@tiptap/core'
import { autoUnwrapBlocks } from '../utils/auto-unwrap'
import { htmlAttrSpec } from '../utils/html-attrs'
import type {
  ComarkElement,
  ComarkElementAttributes,
  ComarkHelpers,
  JSONContent,
  NodeSpec,
} from '../types'

export interface ComarkComponentProp {
  /**
   * Coercion / serialization for one prop.
   *
   *   - `string`  : value rides as-is (`type="info"`).
   *   - `number`  : Comark `:` prefix; coerced to number on parse.
   *   - `boolean` : Comark `:` prefix; "true"/"false" → boolean.
   *   - `json`    : Comark `:` prefix; JSON-encoded for object/array values.
   *
   * `default` is applied when the prop is missing on parse.
   */
  type: 'string' | 'number' | 'boolean' | 'json'
  default?: unknown
}

export interface ComarkComponentDefinition {
  /** Comark tag — `alert`, `badge`, `card`, etc. */
  name: string
  /** Block components (`::alert`) vs inline components (`:badge[…]`). */
  kind: 'block' | 'inline'
  /**
   * Declared props with type info. Each becomes a flat native PM attr; the
   * round-trip respects Comark's `:`-prefix convention for non-strings.
   */
  props?: Record<string, ComarkComponentProp>
  /**
   * Optional Vue/React/etc. NodeView. The `extension.options.nodeView`
   * field is set; the host application is responsible for wiring it via
   * `Node.create({ addNodeView: ... })`. We keep it framework-agnostic
   * here — the bundled `ComarkComponent` is just the schema.
   */
  nodeView?: unknown
}

export interface ComarkComponentExports {
  /** PM extension (Tiptap Node) for the component. */
  extension: TiptapNode<unknown, { comark: NodeSpec }>
  /** Serialization spec. Plug it into `createSerializer` for tests etc. */
  spec: NodeSpec
  /** The original definition. */
  definition: ComarkComponentDefinition
}

// ---------------------------------------------------------------------------
// Prop coercion (matches Comark's `:`-prefix convention)
// ---------------------------------------------------------------------------

/**
 * Coerce an unknown value to a string safely (no `[object Object]` from a
 * stray map/array). Anything that isn't a primitive becomes `null` and is
 * filtered out by callers.
 */
function safeToString(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
    return String(v)
  }
  return null
}

function decodePropValue(type: ComarkComponentProp['type'], raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined
  switch (type) {
    case 'string':
      return safeToString(raw) ?? undefined
    case 'number': {
      const s = safeToString(raw)
      if (s === null) return undefined
      const n = Number(s)
      return Number.isFinite(n) ? n : undefined
    }
    case 'boolean':
      if (typeof raw === 'boolean') return raw
      if (raw === 'true') return true
      if (raw === 'false') return false
      return undefined
    case 'json':
      if (typeof raw === 'object') return raw
      if (typeof raw !== 'string') return undefined
      try {
        return JSON.parse(raw)
      } catch {
        return undefined
      }
  }
}

function encodePropValue(
  type: ComarkComponentProp['type'],
  value: unknown,
): { key: string; raw: string } | null {
  if (value === undefined || value === null) return null
  switch (type) {
    case 'string': {
      const s = safeToString(value)
      return s === null ? null : { key: '', raw: s }
    }
    case 'number': {
      const s = safeToString(value)
      return s === null ? null : { key: ':', raw: s }
    }
    case 'boolean':
      return { key: ':', raw: String(Boolean(value)) }
    case 'json':
      return { key: ':', raw: JSON.stringify(value) }
  }
}

/**
 * Read Comark element attrs, route declared keys into typed props, route
 * the rest into htmlAttrs.
 */
function readPropsAndHtml(
  attrs: ComarkElementAttributes | undefined,
  declared: Record<string, ComarkComponentProp>,
): { props: Record<string, unknown>; htmlAttrs: Record<string, unknown> } {
  const props: Record<string, unknown> = {}
  const htmlAttrs: Record<string, unknown> = {}

  if (!attrs) {
    // Fill defaults
    for (const [name, decl] of Object.entries(declared)) {
      if (decl.default !== undefined) props[name] = decl.default
    }
    return { props, htmlAttrs }
  }

  const seen = new Set<string>()
  for (const [k, v] of Object.entries(attrs)) {
    if (k === '$') continue
    if (v === null || v === undefined) continue
    const bare = k.startsWith(':') ? k.slice(1) : k
    const decl = declared[bare]
    if (decl) {
      const decoded = decodePropValue(decl.type, v)
      if (decoded !== undefined) {
        props[bare] = decoded
        seen.add(bare)
      }
    } else {
      htmlAttrs[k] = v
    }
  }

  // Defaults for unset declared props
  for (const [name, decl] of Object.entries(declared)) {
    if (!seen.has(name) && decl.default !== undefined) {
      props[name] = decl.default
    }
  }

  return { props, htmlAttrs }
}

function writePropsAndHtml(
  props: Record<string, unknown>,
  htmlAttrs: Record<string, unknown>,
  declared: Record<string, ComarkComponentProp>,
): ComarkElementAttributes {
  const out: ComarkElementAttributes = {}

  // Splat htmlAttrs first so semantic prop keys win on collision.
  for (const [k, v] of Object.entries(htmlAttrs)) {
    if (v === null || v === undefined) continue
    out[k] = v
  }

  for (const [name, value] of Object.entries(props)) {
    const decl = declared[name]
    if (!decl) {
      // Stray prop without a declaration — pass through as a string-ish.
      if (value !== null && value !== undefined) out[name] = value
      continue
    }
    const enc = encodePropValue(decl.type, value)
    if (!enc) continue
    out[`${enc.key}${name}`] = enc.raw
  }

  return out
}

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

export function defineComarkComponent(def: ComarkComponentDefinition): ComarkComponentExports {
  const declared = def.props ?? {}
  const isInline = def.kind === 'inline'

  const spec: NodeSpec = {
    pmName: def.name,
    tags: [def.name],
    context: isInline ? 'inline' : 'block',

    toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
      const propsBag: Record<string, unknown> = {}
      for (const name of Object.keys(declared)) {
        if (node.attrs && name in node.attrs) propsBag[name] = node.attrs[name]
      }
      const attrs = writePropsAndHtml(
        propsBag,
        (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
        declared,
      )
      // Block components mirror Comark's autoUnwrap (single attrless
      // paragraph child → flatten to inlines). Inline components hold
      // inline content directly so no autoUnwrap question.
      const children = isInline
        ? h.serializeInlines(node.content)
        : autoUnwrapBlocks(node.content, h)
      return [def.name, attrs, ...children]
    },

    fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
      const [, rawAttrs, ...children] = el
      const { props, htmlAttrs } = readPropsAndHtml(rawAttrs, declared)
      const attrs: Record<string, unknown> = { ...props }
      if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs

      const content = isInline ? h.parseInlines(children) : h.parseBlocks(children)

      const out: JSONContent = { type: def.name }
      if (Object.keys(attrs).length > 0) out.attrs = attrs

      if (content.length > 0) {
        out.content = content
      } else if (!isInline) {
        out.content = [{ type: 'paragraph' }]
      }
      return out
    },
  }

  // Build the matching Tiptap Node extension. Each declared prop becomes a
  // first-class PM attr.
  const propAttrs: Record<string, { default: unknown }> = {}
  for (const [name, decl] of Object.entries(declared)) {
    propAttrs[name] = { default: decl.default ?? null }
  }

  const extension = Node.create({
    name: def.name,
    group: isInline ? 'inline' : 'block',
    inline: isInline,
    content: isInline ? 'inline*' : 'block+',
    defining: !isInline,
    selectable: true,
    draggable: !isInline,

    addAttributes() {
      return {
        ...propAttrs,
        ...htmlAttrSpec({ reserved: Object.keys(declared) }),
      }
    },

    parseHTML() {
      return [{ tag: `${isInline ? 'span' : 'div'}[data-comark-component="${def.name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [
        isInline ? 'span' : 'div',
        mergeAttributes(HTMLAttributes, { 'data-comark-component': def.name }),
        0,
      ]
    },

    addStorage() {
      return { comark: spec }
    },
  })

  return { extension, spec, definition: def }
}
