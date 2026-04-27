/**
 * `blockquote` — wraps block content. No semantic attrs; everything Comark
 * carries (class, id, data-cite, ...) goes onto `htmlAttrs`.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { autoUnwrapBlocks } from '../utils/auto-unwrap'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

export const blockquoteSpec: NodeSpec = {
  pmName: 'blockquote',
  tags: ['blockquote'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    // Comark autoUnwraps single-paragraph blockquotes — mirror that on
    // serialize so `> Look **here** thanks.` round-trips clean.
    return ['blockquote', attrs, ...autoUnwrapBlocks(node.content, h)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = {
      type: 'blockquote',
      content: h.parseBlocks(children),
    }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkBlockquote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'blockquote' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: blockquoteSpec }
  },
})
