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
import { hasNoHtmlAttrs, mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

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
    // Note: `hasNoHtmlAttrs` collapses missing-vs-`{}` bags so a paragraph
    // round-tripped through DOM (where PM fills the default `{}`) is still
    // recognised as "attrless" and gets flattened to the tight form.
    const firstIsAttrlessParagraph = first?.type === 'paragraph' && hasNoHtmlAttrs(first)

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

    // `<li>` children are mixed inline/block. The orchestrator's
    // `parseBlocks` already buckets consecutive inline runs (text, marks,
    // inline-context nodes — including user-defined inline components)
    // into paragraphs and passes block elements through. Delegating keeps
    // a single source of truth for "what's inline" rather than duplicating
    // the rule with a hardcoded `br | img` set.
    const content = h.parseBlocks(children)
    if (content.length === 0) content.push({ type: 'paragraph' })

    const out: JSONContent = { type: 'listItem', content }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
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
