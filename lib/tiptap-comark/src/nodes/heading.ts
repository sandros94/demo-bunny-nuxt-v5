/**
 * `heading` — h1..h6, with `level` as a native semantic attr and the rest
 * (id from `{#anchor}`, class, etc.) on `htmlAttrs`.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(6, Math.max(1, Math.floor(n)))
}

export const headingSpec: NodeSpec = {
  pmName: 'heading',
  tags: HEADING_TAGS,

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const level = clampLevel(Number(node.attrs?.level ?? 1))
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return [`h${level}`, attrs, ...h.serializeInlines(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [tag, rawAttrs, ...children] = el
    const level = clampLevel(Number(tag.slice(1)))
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const attrs: Record<string, unknown> = { level }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return {
      type: 'heading',
      attrs,
      content: h.parseInlines(children),
    }
  },
}

export const ComarkHeading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,

  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6] as ReadonlyArray<1 | 2 | 3 | 4 | 5 | 6>,
    }
  },

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: (el) => clampLevel(Number(el.tagName.slice(1))),
        // `level` decides the tag (`h2`, `h3`, …) — `renderHTML` of the
        // node body emits the correct tag, so we don't need to render it
        // as an attribute here.
        renderHTML: () => ({}),
      },
      ...htmlAttrSpec({ reserved: ['level'] }),
    }
  },

  parseHTML() {
    return HEADING_TAGS.map((tag) => ({ tag }))
  },

  renderHTML({ node, HTMLAttributes }) {
    const level = clampLevel(Number(node.attrs.level ?? 1))
    return [`h${level}`, mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-1': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 1 }),
      'Mod-Alt-2': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 2 }),
      'Mod-Alt-3': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 3 }),
      'Mod-Alt-4': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 4 }),
      'Mod-Alt-5': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 5 }),
      'Mod-Alt-6': () => this.editor.commands.toggleNode(this.name, 'paragraph', { level: 6 }),
    }
  },

  addStorage() {
    return { comark: headingSpec }
  },
})
