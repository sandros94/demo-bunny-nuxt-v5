/**
 * `horizontalRule` — atom node mapping to Comark `<hr>`.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, JSONContent, NodeSpec } from '../types'

export const horizontalRuleSpec: NodeSpec = {
  pmName: 'horizontalRule',
  tags: ['hr'],

  toComark(node: JSONContent): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['hr', attrs]
  },

  fromComark(el: ComarkElement): JSONContent {
    const [, rawAttrs] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = { type: 'horizontalRule' }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkHorizontalRule = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'hr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes)]
  },

  addStorage() {
    return { comark: horizontalRuleSpec }
  },
})
