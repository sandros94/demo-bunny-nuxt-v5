/**
 * `htmlAttrSpec` — a Tiptap `addAttributes()` fragment that gives a node or
 * mark a single PM attribute named `htmlAttrs` of shape
 * `Record<string, unknown>`.
 *
 * On `parseHTML` it harvests every DOM attribute except the ones the
 * extension already handles natively (so `level` on a heading isn't
 * double-counted) and except editor-internal attributes (`data-pm-*`,
 * `contenteditable`, ProseMirror's own decorations).
 *
 * On `renderHTML` it splats them back as real HTML attributes, so the
 * editor's view shows the actual `class`, `id`, `data-*`, and `aria-*` on
 * the element.
 *
 * This is what makes round-tripping `**bold**{.foo}` lossless without a
 * sidecar `comarkExtras` carrier — the `class` is a real attribute on a
 * real `bold` mark in the schema.
 */

import type { Attributes } from '@tiptap/core'

/**
 * Internal DOM attributes that PM/Tiptap manages itself, and namespace
 * prefixes the kit uses for its own discriminator/payload attributes.
 *
 * `data-comark-` is reserved for the kit's own use (`data-comark-comment`,
 * `data-comark-template`, `data-comark-component`, …): these attributes
 * carry payload or act as parseHTML matchers, and harvesting them into
 * `htmlAttrs` would (a) duplicate the value into a field that re-renders
 * separately and (b) "leak" the marker into the AST on round-trip.
 *
 * If a downstream user genuinely wants to attach a `data-comark-foo` of
 * their own, they should pick a different prefix — the namespace is the
 * kit's contract.
 */
const PM_INTERNAL_ATTR_PREFIXES = [
  'data-pm-',
  'data-prosemirror-',
  'pm-',
  'data-node-view-',
  'data-comark-',
] as const

const PM_INTERNAL_ATTR_NAMES = new Set(['contenteditable', 'draggable', 'spellcheck'])

function isInternalAttr(name: string): boolean {
  if (PM_INTERNAL_ATTR_NAMES.has(name)) return true
  for (const prefix of PM_INTERNAL_ATTR_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }
  return false
}

export interface HtmlAttrSpecOptions {
  /**
   * Native attributes the extension declares separately (e.g. `level` on a
   * heading, `language` on a code block). These are excluded from the
   * `htmlAttrs` bag so a single value never lives in two places.
   */
  reserved?: readonly string[]
}

/**
 * Returns a Tiptap `addAttributes()` fragment containing a single
 * `htmlAttrs` attribute. Spread it into your extension's `addAttributes()`
 * alongside any native semantic attrs.
 *
 *   addAttributes() {
 *     return {
 *       level: { default: 1, parseHTML: (el) => Number(el.tagName.slice(1)) },
 *       ...htmlAttrSpec({ reserved: ['level'] }),
 *     }
 *   }
 */
export function htmlAttrSpec(options: HtmlAttrSpecOptions = {}): Attributes {
  const reserved = new Set(options.reserved ?? [])
  return {
    htmlAttrs: {
      // Default to an empty record so consumers can read `htmlAttrs` as a
      // `Record<string, unknown>` without needing a null check. The bag
      // accepts any primitive — strings, numbers, booleans, bigints — and
      // `renderHTML` stringifies them; non-primitives are dropped to avoid
      // emitting `[object Object]` as an HTML attribute.
      default: {} as Record<string, unknown>,
      parseHTML: (el: HTMLElement) => {
        const out: Record<string, string> = {}
        for (const attr of Array.from(el.attributes)) {
          if (reserved.has(attr.name)) continue
          if (isInternalAttr(attr.name)) continue
          out[attr.name] = attr.value
        }
        return Object.keys(out).length > 0 ? out : null
      },
      renderHTML: (attrs: { htmlAttrs?: Record<string, unknown> | null }) => {
        const bag = attrs.htmlAttrs
        if (!bag || typeof bag !== 'object') return {}
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(bag)) {
          if (v === null || v === undefined) continue
          // Skip non-primitive values rather than risk `[object Object]` —
          // HTML attributes are strings by definition.
          if (typeof v === 'string') {
            out[k] = v
          } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') {
            out[k] = String(v)
          }
        }
        return out
      },
    },
  }
}
