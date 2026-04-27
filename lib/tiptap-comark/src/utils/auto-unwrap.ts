/**
 * `autoUnwrapBlocks` — mirror Comark's parser-level autoUnwrap on serialize.
 *
 * Rule (per Comark docs): "Auto-unwrap applies to any component whose only
 * child is a single paragraph." The parser strips the `<p>` wrapper for
 * tight container content; we strip it on the way out so the resulting AST
 * matches what `parse(md)` would produce.
 *
 * Use this from container nodes (blockquote, block components) where
 * Comark's parser would have autoUnwrapped. Don't use it where the
 * paragraph wrapper is structurally required (table cells handle their
 * own variant; list items have a richer tight/loose ruleset).
 */

import type { ComarkHelpers, ComarkNode, JSONContent } from '../types'

export function autoUnwrapBlocks(
  content: JSONContent[] | undefined,
  h: ComarkHelpers,
): ComarkNode[] {
  const list = content ?? []
  if (list.length === 1 && list[0]?.type === 'paragraph' && !list[0]?.attrs?.htmlAttrs) {
    return h.serializeInlines(list[0]?.content)
  }
  return h.serializeBlocks(list)
}
