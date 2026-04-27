/**
 * Lists — `bulletList`, `orderedList`, and `listItem`. Three extensions in
 * one file because they only make sense as a triple.
 *
 *   - bullet  → ['ul', attrs, ...listItems]
 *   - ordered → ['ol', { start? }, ...listItems]
 *   - item    → ['li', attrs, ...inlines | ...blocks]
 *
 * Comark supports a mix of inline and block content inside `<li>`. We model
 * `listItem` as `paragraph block*` and inline inside the paragraph — the
 * orchestrator's helpers wrap stray inlines in a paragraph automatically.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, ComarkNode, JSONContent, NodeSpec } from '../types'

// ---------------------------------------------------------------------------
// listItem
// ---------------------------------------------------------------------------

export const listItemSpec: NodeSpec = {
  pmName: 'listItem',
  tags: ['li'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )

    const content = node.content ?? []
    const first = content[0]
    const firstIsAttrlessParagraph = first?.type === 'paragraph' && !first.attrs?.htmlAttrs

    // Single attrless paragraph → flatten fully. Matches the canonical
    // tight item form `['li',{},'one']`.
    if (content.length === 1 && firstIsAttrlessParagraph) {
      return ['li', attrs, ...h.serializeInlines(first.content)]
    }

    // Leading paragraph followed by non-paragraph blocks → flatten just
    // the first paragraph (tight + nested form: `['li',{},'a',['ul',…]]`).
    // If any subsequent child is also a paragraph, the item is "loose"
    // and we keep every paragraph wrapped to preserve that distinction.
    if (firstIsAttrlessParagraph && content.length > 1) {
      const tail = content.slice(1)
      const hasOtherParagraphs = tail.some((c) => c.type === 'paragraph')
      if (!hasOtherParagraphs) {
        return ['li', attrs, ...h.serializeInlines(first.content), ...h.serializeBlocks(tail)]
      }
    }

    return ['li', attrs, ...h.serializeBlocks(content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])

    // li children are mixed inline/block — bucket them. Consecutive inline
    // runs go into a single paragraph; block children pass through.
    const content = bucketMixed(children, h)
    if (content.length === 0) content.push({ type: 'paragraph' })

    const out: JSONContent = { type: 'listItem', content }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

/**
 * Group a mixed inline/block child list into PM block content. Consecutive
 * inline-only children become one paragraph.
 */
function bucketMixed(children: ComarkNode[], h: ComarkHelpers): JSONContent[] {
  const out: JSONContent[] = []
  let inlineBuf: ComarkNode[] = []

  const flush = () => {
    if (inlineBuf.length === 0) return
    const inlines = h.parseInlines(inlineBuf)
    if (inlines.length > 0) out.push({ type: 'paragraph', content: inlines })
    inlineBuf = []
  }

  for (const child of children) {
    if (typeof child === 'string') {
      inlineBuf.push(child)
      continue
    }
    if (!Array.isArray(child)) continue
    // Comments are dropped at this layer.
    if (child[0] === null) continue
    const tag = child[0]
    // Inline-only tags go into the buffer; everything else is treated as
    // a block. Picking based on the orchestrator's mark/node specs would
    // be cleaner, but the small fixed set here covers Comark's emission.
    if (isInlineTag(tag, h)) {
      inlineBuf.push(child)
    } else {
      flush()
      out.push(...h.parseBlocks([child]))
    }
  }
  flush()
  return out
}

function isInlineTag(tag: string, h: ComarkHelpers): boolean {
  if (h.markSpecs.some((m) => (m.tags as readonly string[]).includes(tag))) return true
  // br, img, and registered inline components are nodes but inline.
  if (tag === 'br' || tag === 'img') return true
  return false
}

export const ComarkListItem = Node.create({
  name: 'listItem',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'li' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Enter': () => this.editor.commands.splitListItem(this.name),
      'Tab': () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    }
  },

  addStorage() {
    return { comark: listItemSpec }
  },
})

// ---------------------------------------------------------------------------
// bulletList
// ---------------------------------------------------------------------------

export const bulletListSpec: NodeSpec = {
  pmName: 'bulletList',
  tags: ['ul'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['ul', attrs, ...h.serializeBlocks(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const items = h.parseBlocks(children).filter((c) => c.type === 'listItem')
    const out: JSONContent = { type: 'bulletList', content: items }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkBulletList = Node.create({
  name: 'bulletList',
  group: 'block list',
  content: 'listItem+',

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'ul' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-8': () => this.editor.commands.toggleList('bulletList', 'listItem'),
    }
  },

  addStorage() {
    return { comark: bulletListSpec }
  },
})

// ---------------------------------------------------------------------------
// orderedList
// ---------------------------------------------------------------------------

const ORDERED_LIST_SEMANTIC = ['start'] as const

export const orderedListSpec: NodeSpec = {
  pmName: 'orderedList',
  tags: ['ol'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const semantic: Record<string, unknown> = {}
    // Comark's parser stores `start` as a string ("5") for round-trip
    // stability. Mirror that on output so `parse(md) === toComark(fromComark(...))`.
    const startRaw = node.attrs?.start
    if (startRaw != null && String(startRaw) !== '1') {
      semantic.start = String(startRaw)
    }
    const attrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['ol', attrs, ...h.serializeBlocks(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, ORDERED_LIST_SEMANTIC)
    const attrs: Record<string, unknown> = {}
    if (semantic.start != null) attrs.start = semantic.start
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    const items = h.parseBlocks(children).filter((c) => c.type === 'listItem')
    const out: JSONContent = { type: 'orderedList', content: items }
    if (Object.keys(attrs).length > 0) out.attrs = attrs
    return out
  },
}

export const ComarkOrderedList = Node.create({
  name: 'orderedList',
  group: 'block list',
  content: 'listItem+',

  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (el) => {
          const raw = el.getAttribute('start')
          return raw ? Number(raw) : 1
        },
        renderHTML: (attrs) =>
          attrs.start && attrs.start !== 1 ? { start: String(attrs.start) } : {},
      },
      ...htmlAttrSpec({ reserved: ['start'] }),
    }
  },

  parseHTML() {
    return [{ tag: 'ol' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ol', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-7': () => this.editor.commands.toggleList('orderedList', 'listItem'),
    }
  },

  addStorage() {
    return { comark: orderedListSpec }
  },
})
