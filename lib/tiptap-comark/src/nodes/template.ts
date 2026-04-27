/**
 * `comarkTemplate` — Comark's `["template", { name }, …block]` slot
 * container, used by named slots:
 *
 *   ::card
 *   #header
 *   ## Title
 *
 *   #content
 *   Body
 *   ::
 *
 * `name` is a native semantic attr; everything else lives on `htmlAttrs`.
 * Block content; the children are arbitrary blocks (paragraphs, headings,
 * nested components, etc.).
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

const SEMANTIC_KEYS = ['name'] as const

export const templateSpec: NodeSpec = {
  pmName: 'comarkTemplate',
  tags: ['template'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const semantic: Record<string, unknown> = {}
    if (node.attrs?.name != null) semantic.name = node.attrs.name
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['template', attrs, ...h.serializeBlocks(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = {}
    if (semantic.name != null) attrs.name = semantic.name
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    const content = h.parseBlocks(children)
    return {
      type: 'comarkTemplate',
      attrs,
      content: content.length > 0 ? content : [{ type: 'paragraph' }],
    }
  },
}

export const ComarkTemplate = Node.create({
  name: 'comarkTemplate',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-slot'),
        renderHTML: (attrs) => (attrs.name ? { 'data-slot': attrs.name as string } : {}),
      },
      ...htmlAttrSpec({ reserved: SEMANTIC_KEYS as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-comark-template]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-comark-template': '' }), 0]
  },

  addStorage() {
    return { comark: templateSpec }
  },
})
