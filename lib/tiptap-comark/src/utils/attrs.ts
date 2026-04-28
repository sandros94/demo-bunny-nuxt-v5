/**
 * Attribute helpers shared by every Comark extension.
 *
 * Two flavors:
 *
 *   - `splitAttrs(attrs, semanticKeys)` — splits a Comark element's attrs
 *     into the keys a node/mark schemas natively (`level`, `language`, `src`,
 *     …) and the leftover HTML-style attrs (`class`, `id`, `style`,
 *     `data-*`, `aria-*`, custom). The leftover bag rides on a single
 *     `htmlAttrs` PM attr declared by every extension via `htmlAttrSpec`.
 *
 *   - `mergeAttrs(semantic, htmlAttrs)` — the inverse, for serializing back
 *     to Comark. Drops nullish entries so the AST stays clean.
 *
 * Comark's parser stamps a `$` source-position bag onto every element. We
 * scrub it everywhere — it's parser bookkeeping that gets regenerated on the
 * next `parse()` and would mislead anyone reading the AST.
 */

import type { ComarkElementAttributes } from '../types'

/** Drop nullish values; never include the `$` parser metadata. */
export function cleanAttrs(attrs: ComarkElementAttributes | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!attrs) return out
  for (const [k, v] of Object.entries(attrs)) {
    if (k === '$') continue
    if (v === null || v === undefined) continue
    out[k] = v
  }
  return out
}

/**
 * Split Comark element attrs into (semantic, htmlAttrs).
 *
 *   semantic:  keys the extension declares natively on the PM schema
 *   htmlAttrs: the rest — class, id, data-*, aria-*, custom, … — destined
 *              for the extension's `htmlAttrs` PM attr
 *
 * Skips `$` and nullish entries.
 */
export function splitAttrs(
  attrs: ComarkElementAttributes | undefined,
  semanticKeys: readonly string[],
): {
  semantic: Record<string, unknown>
  htmlAttrs: Record<string, unknown>
} {
  const semantic: Record<string, unknown> = {}
  const htmlAttrs: Record<string, unknown> = {}
  if (!attrs) return { semantic, htmlAttrs }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === '$') continue
    if (v === null || v === undefined) continue
    if (semanticKeys.includes(k)) semantic[k] = v
    else htmlAttrs[k] = v
  }
  return { semantic, htmlAttrs }
}

/**
 * Merge a node/mark's semantic attrs with its `htmlAttrs` bag back into a
 * single Comark element-attrs object. Semantic keys win on collision.
 */
export function mergeAttrs(
  semantic: Record<string, unknown>,
  htmlAttrs: Record<string, unknown> | undefined,
): ComarkElementAttributes {
  const out: ComarkElementAttributes = {}
  if (htmlAttrs) {
    for (const [k, v] of Object.entries(htmlAttrs)) {
      if (v === null || v === undefined) continue
      out[k] = v
    }
  }
  for (const [k, v] of Object.entries(semantic)) {
    if (v === null || v === undefined) continue
    out[k] = v
  }
  return out
}

/**
 * Is the node's `htmlAttrs` bag effectively empty? Two states get
 * collapsed: the bag is missing entirely (a fresh AST built via
 * `fromComark` doesn't add `htmlAttrs` when there's nothing to put in
 * it), and the bag is `{}` (PM's parseHTML default — Tiptap fills the
 * default whenever `parseHTML` returns `null`, so any DOM round-trip
 * leaves `htmlAttrs: {}` even for an attrless element). Code that needs
 * to ask "does this paragraph have any HTML attrs?" must treat both as
 * the same.
 */
export function hasNoHtmlAttrs(
  node: { attrs?: { htmlAttrs?: unknown } } | null | undefined,
): boolean {
  if (!node) return true
  const html = node.attrs?.htmlAttrs as Record<string, unknown> | null | undefined
  if (!html) return true
  if (typeof html !== 'object') return true
  return Object.keys(html).length === 0
}

/**
 * Are two `htmlAttrs` Records value-equal? PM compares mark attrs
 * structurally, but adjacent marks with `{ class: 'a' }` and
 * `{ class: 'a', id: undefined }` would otherwise be considered distinct
 * and prevent merging. Use this when canonicalizing output.
 */
export function attrsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const ak = Object.keys(a ?? {}).filter((k) => (a as Record<string, unknown>)[k] != null)
  const bk = Object.keys(b ?? {}).filter((k) => (b as Record<string, unknown>)[k] != null)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false
  }
  return true
}
