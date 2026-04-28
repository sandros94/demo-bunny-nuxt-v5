/**
 * `comarkComment` — preserves Comark `[null, attrs, "text"]` HTML comments
 * as a first-class atom node so they survive the editor.
 *
 * The orchestrator dispatches to this spec when it sees a comment in
 * block context. The comment text rides on a native `text` attr (PM atoms
 * don't have inner content, so we use an attr for the payload).
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
// The Comark *tuple* type is imported under an alias so we can name the
// Tiptap *extension* `ComarkComment` without a merged-declaration clash.
import type {
  ComarkComment as ComarkCommentTuple,
  ComarkElement,
  JSONContent,
  NodeSpec,
} from '../types'

const SEMANTIC_KEYS = ['text'] as const

export const commentSpec: NodeSpec = {
  pmName: 'comarkComment',
  // The orchestrator never matches `null` to a tag string — it dispatches
  // by detecting `el[0] === null` and looking up `comarkComment` directly.
  // Listing an empty tag set keeps the dispatch table clean.
  tags: [] as readonly string[],

  toComark(node: JSONContent): ComarkCommentTuple {
    const text = (node.attrs?.text as string | undefined) ?? ''
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return [null, attrs, text]
  },

  fromComark(el: ComarkElement): JSONContent | null {
    // Cast to the comment shape — orchestrator only routes comments here.
    const comment = el as unknown as ComarkCommentTuple
    const text = comment[2] ?? ''
    const { htmlAttrs } = splitAttrs(comment[1], SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = { text }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return { type: 'comarkComment', attrs }
  },
}

export const ComarkComment = Node.create({
  name: 'comarkComment',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      // `data-comark-comment` doubles as both the marker (so `parseHTML`'s
      // attribute selector matches) and the payload — emitting it
      // unconditionally avoids the previous bug where the node-level
      // `renderHTML` overwrote a non-empty payload with an empty marker
      // string via `mergeAttributes` last-wins semantics.
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-comark-comment') ?? '',
        renderHTML: (attrs) => ({
          'data-comark-comment': typeof attrs.text === 'string' ? attrs.text : '',
        }),
      },
      ...htmlAttrSpec({ reserved: SEMANTIC_KEYS as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-comark-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)]
  },

  addStorage() {
    return { comark: commentSpec }
  },
})
