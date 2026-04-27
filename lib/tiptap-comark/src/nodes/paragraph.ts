/**
 * `paragraph` — the most boring node, the most common shape, and a useful
 * template to read first when picking up the kit.
 *
 * Comark shape: `["p", attrs, ...inlines]`.
 *
 * No native semantic attrs — every attribute Comark might carry rides on
 * a single `htmlAttrs` PM attr (class, id, style, data-..., aria-...,
 * custom).
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

export const paragraphSpec: NodeSpec = {
  pmName: 'paragraph',
  tags: ['p'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['p', attrs, ...h.serializeInlines(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = {
      type: 'paragraph',
      content: h.parseInlines(children),
    }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkParagraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      ...htmlAttrSpec(),
    }
  },

  parseHTML() {
    return [{ tag: 'p' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: paragraphSpec }
  },
})
