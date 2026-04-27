/**
 * Type re-exports + the serialization protocol that every Comark node and
 * mark extension plugs into.
 *
 * Public PM JSON shape comes from `@tiptap/core` — `JSONContent`. Public
 * Comark AST shape comes from `comark`. We don't reinvent either; this file
 * is just the glue.
 */

// Augment Tiptap's NodeConfig with the `tableRole` field used by
// `prosemirror-tables` for cell/row/header behavior. The official
// `@tiptap/extension-table` ships this same augmentation; we duplicate it
// here so our table extensions work without depending on that package.
declare module '@tiptap/core' {
  interface NodeConfig {
    tableRole?: 'table' | 'row' | 'header_cell' | 'cell' | 'caption'
  }
}

import type { JSONContent } from '@tiptap/core'
import type {
  ComarkComment,
  ComarkElement,
  ComarkElementAttributes,
  ComarkNode,
  ComarkText,
  ComarkTree,
} from 'comark'

export type {
  ComarkComment,
  ComarkElement,
  ComarkElementAttributes,
  ComarkNode,
  ComarkText,
  ComarkTree,
  JSONContent,
}

/**
 * A PM mark in JSON form. The `marks` array on `JSONContent` doesn't have a
 * named type so we name one for clarity.
 */
export interface PMMark {
  type: string
  attrs?: Record<string, unknown>
}

/**
 * Per-node serialization spec. Every node extension exports one of these and
 * stashes it in its Tiptap storage. The orchestrator (`createSerializer`)
 * builds dispatch tables from a list of these.
 */
export interface NodeSpec {
  /** PM type name (matches the Tiptap node's `name` field). */
  pmName: string
  /**
   * Comark tag(s) this node claims on the way in. Heading claims `h1..h6`;
   * paragraph claims `p`; etc. Tag is matched on `el[0]`.
   */
  tags: readonly string[]
  /**
   * Whether this node is a block-level structural element (default) or an
   * inline atom that can appear inside a paragraph (`hardBreak`, `image`,
   * registered inline components). The orchestrator uses this to bucket
   * Comark's autoUnwrap-flattened inline runs back into paragraphs.
   *
   * @default 'block'
   */
  context?: 'block' | 'inline'
  /** PM JSON node → Comark element. */
  toComark: (node: JSONContent, h: ComarkHelpers) => ComarkNode | null
  /** Comark element → PM JSON node. */
  fromComark: (el: ComarkElement, h: ComarkHelpers) => JSONContent | null
  /**
   * Optional disambiguation when several specs share a tag. The first spec
   * whose `matches` returns true wins. Without `matches`, the first spec for
   * a given tag wins by registration order.
   */
  matches?: (el: ComarkElement) => boolean
}

/**
 * Per-mark serialization spec. Marks differ from nodes in that they wrap
 * inline content rather than carrying it — the orchestrator hands the
 * already-serialized child node to `toComark` and asks the mark to wrap it.
 */
export interface MarkSpec {
  pmName: string
  tags: readonly string[]
  /** Wrap an already-serialized child Comark node with this mark. */
  toComark: (mark: PMMark, child: ComarkNode) => ComarkElement
  /** Read attrs off a Comark element and turn them into a PM mark. */
  fromComark: (el: ComarkElement) => PMMark | null
}

/**
 * Recursion helpers passed into every `toComark` / `fromComark` so each
 * extension can defer back to the orchestrator for nested children.
 */
export interface ComarkHelpers {
  /** PM block-content children → Comark nodes. */
  serializeBlocks: (content: JSONContent[] | undefined) => ComarkNode[]
  /** PM inline-content children (text + marks + inline atoms) → Comark nodes. */
  serializeInlines: (content: JSONContent[] | undefined) => ComarkNode[]
  /** Comark children (block context) → PM JSON nodes. */
  parseBlocks: (children: ComarkNode[]) => JSONContent[]
  /** Comark children (inline context) → PM JSON nodes. */
  parseInlines: (children: ComarkNode[]) => JSONContent[]
  /** All node specs registered with the orchestrator. */
  nodeSpecs: readonly NodeSpec[]
  /** All mark specs registered with the orchestrator. */
  markSpecs: readonly MarkSpec[]
}
