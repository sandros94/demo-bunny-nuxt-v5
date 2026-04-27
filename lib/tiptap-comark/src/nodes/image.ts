/**
 * `image` — `<img>` with `src`/`alt`/`title` as semantic attrs and the rest
 * (width, height, class, data-*, etc.) on `htmlAttrs`.
 *
 * Comark allows images at both block and inline level. The orchestrator
 * dispatches based on context (parseBlocks vs parseInlines), so this spec
 * just needs to handle the round-trip; it works in either context because
 * its produced PM node is `inline: true` and PM's schema permits it.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, JSONContent, NodeSpec } from '../types'

const SEMANTIC_KEYS = ['src', 'alt', 'title'] as const

export const imageSpec: NodeSpec = {
  pmName: 'image',
  tags: ['img'],
  context: 'inline',

  toComark(node: JSONContent): ComarkElement {
    const semantic: Record<string, unknown> = {}
    if (node.attrs?.src) semantic.src = node.attrs.src
    if (node.attrs?.alt) semantic.alt = node.attrs.alt
    if (node.attrs?.title) semantic.title = node.attrs.title
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['img', attrs]
  },

  fromComark(el: ComarkElement): JSONContent {
    const { semantic, htmlAttrs } = splitAttrs(el[1], SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = {
      src: (semantic.src as string | undefined) ?? '',
      alt: (semantic.alt as string | null | undefined) ?? null,
      title: (semantic.title as string | null | undefined) ?? null,
    }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return { type: 'image', attrs }
  },
}

export const ComarkImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('src') ?? '',
        renderHTML: (attrs) => (attrs.src ? { src: attrs.src as string } : {}),
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute('alt'),
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt as string } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('title'),
        renderHTML: (attrs) => (attrs.title ? { title: attrs.title as string } : {}),
      },
      ...htmlAttrSpec({ reserved: SEMANTIC_KEYS as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },

  addStorage() {
    return { comark: imageSpec }
  },
})
