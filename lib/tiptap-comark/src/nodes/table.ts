/**
 * Tables — `table`, `tableRow`, `tableHeader`, `tableCell`. Four
 * extensions, one file because they only make sense together.
 *
 * Comark shape:
 *
 *   ['table', attrs,
 *     ['thead', {}, ['tr', {}, ['th', { align? }, …inlines]]],
 *     ['tbody', {}, ['tr', {}, ['td', { align? }, …inlines]]]]
 *
 * The `thead`/`tbody` grouping is purely structural — Tiptap's table
 * model is a flat list of rows. We discriminate header rows by checking
 * whether all of a row's cells are `tableHeader`. On the way back out we
 * regroup into `thead`/`tbody`.
 *
 * Standard PM cell attrs: `colspan`, `rowspan`, `colwidth` (Tiptap's
 * built-in table follows this naming). `align` from the markdown
 * `|:---|:--:|---:|` syntax rides on `htmlAttrs`.
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { hasNoHtmlAttrs, mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, ComarkNode, JSONContent, NodeSpec } from '../types'

// ---------------------------------------------------------------------------
// table
// ---------------------------------------------------------------------------

export const tableSpec: NodeSpec = {
  pmName: 'table',
  tags: ['table'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )

    const headerRows: ComarkElement[] = []
    const bodyRows: ComarkElement[] = []
    for (const row of node.content ?? []) {
      if (row.type !== 'tableRow') continue
      const allHeaders =
        (row.content?.length ?? 0) > 0 && (row.content ?? []).every((c) => c.type === 'tableHeader')
      const out = h.serializeBlocks([row])[0] as ComarkElement | undefined
      if (!out) continue
      if (allHeaders) headerRows.push(out)
      else bodyRows.push(out)
    }

    const children: ComarkNode[] = []
    if (headerRows.length > 0) children.push(['thead', {}, ...headerRows])
    if (bodyRows.length > 0) children.push(['tbody', {}, ...bodyRows])
    return ['table', attrs, ...children]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])

    // Walk thead/tbody; pull rows out flat. A stripped-down `[table, attrs,
    // …rows]` (no thead/tbody) is also tolerated.
    const rows: JSONContent[] = []
    for (const child of children) {
      if (!Array.isArray(child) || child[0] === null) continue
      const tag = child[0] as string
      if (tag === 'thead' || tag === 'tbody') {
        for (const row of child.slice(2) as ComarkNode[]) {
          if (Array.isArray(row) && row[0] === 'tr') {
            const json = h.parseBlocks([row])[0]
            if (json) rows.push(json)
          }
        }
      } else if (tag === 'tr') {
        const json = h.parseBlocks([child])[0]
        if (json) rows.push(json)
      }
    }

    const out: JSONContent = { type: 'table', content: rows }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkTable = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  isolating: true,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'table' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes), ['tbody', 0]]
  },

  addStorage() {
    return { comark: tableSpec }
  },
})

// ---------------------------------------------------------------------------
// tableRow
// ---------------------------------------------------------------------------

export const tableRowSpec: NodeSpec = {
  pmName: 'tableRow',
  tags: ['tr'],

  toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['tr', attrs, ...h.serializeBlocks(node.content)]
  },

  fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...cells] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const content = cells
      .map((c) => (Array.isArray(c) ? h.parseBlocks([c])[0] : null))
      .filter((c): c is JSONContent => c != null)
    const out: JSONContent = { type: 'tableRow', content }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkTableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)+',
  tableRole: 'row',

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'tr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: tableRowSpec }
  },
})

// ---------------------------------------------------------------------------
// tableHeader / tableCell — share the same body
// ---------------------------------------------------------------------------

const CELL_SEMANTIC = ['colspan', 'rowspan', 'colwidth'] as const

function makeCellSpec(pmName: 'tableHeader' | 'tableCell', tag: 'th' | 'td'): NodeSpec {
  return {
    pmName,
    tags: [tag],
    toComark(node: JSONContent, h: ComarkHelpers): ComarkElement {
      const semantic: Record<string, unknown> = {}
      const colspan = node.attrs?.colspan
      const rowspan = node.attrs?.rowspan
      const colwidth = node.attrs?.colwidth
      if (colspan != null && Number(colspan) !== 1) semantic.colspan = Number(colspan)
      if (rowspan != null && Number(rowspan) !== 1) semantic.rowspan = Number(rowspan)
      if (colwidth != null) semantic.colwidth = colwidth

      const attrs = mergeAttrs(
        semantic,
        (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
      )

      // If the cell holds a single attrless paragraph, inline its children
      // (canonical markdown table-cell shape). Otherwise serialize blocks.
      // `hasNoHtmlAttrs` keeps DOM-roundtripped cells (which carry the
      // PM-default `htmlAttrs: {}`) on the flatten branch.
      const content = node.content ?? []
      if (content.length === 1 && content[0]?.type === 'paragraph' && hasNoHtmlAttrs(content[0])) {
        return [tag, attrs, ...h.serializeInlines(content[0]?.content)]
      }
      return [tag, attrs, ...h.serializeBlocks(content)]
    },

    fromComark(el: ComarkElement, h: ComarkHelpers): JSONContent {
      const [, rawAttrs, ...children] = el
      const { semantic, htmlAttrs } = splitAttrs(rawAttrs, CELL_SEMANTIC)

      // colspan/rowspan default to 1 — drop them on the way in too so the
      // PM JSON doesn't carry redundant attrs that break round-trip
      // equality with the parser output.
      const attrs: Record<string, unknown> = {}
      if (semantic.colspan != null && Number(semantic.colspan) !== 1) {
        attrs.colspan = Number(semantic.colspan)
      }
      if (semantic.rowspan != null && Number(semantic.rowspan) !== 1) {
        attrs.rowspan = Number(semantic.rowspan)
      }
      if (semantic.colwidth != null) attrs.colwidth = semantic.colwidth
      if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs

      // Cell children are typically inline runs from a markdown table.
      // Wrap them in a single paragraph (PM cells need block content).
      // If we see a real block among the children, switch to block mode.
      const hasBlock = children.some((c) => Array.isArray(c) && isCellBlockTag(c[0]))
      let content: JSONContent[]
      if (hasBlock) {
        content = h.parseBlocks(children)
      } else {
        const inlines = h.parseInlines(children)
        content =
          inlines.length > 0 ? [{ type: 'paragraph', content: inlines }] : [{ type: 'paragraph' }]
      }

      const out: JSONContent = { type: pmName, content }
      if (Object.keys(attrs).length > 0) out.attrs = attrs
      return out
    },
  }
}

function isCellBlockTag(tag: unknown): boolean {
  if (typeof tag !== 'string') return false
  return (
    tag === 'p' ||
    tag === 'blockquote' ||
    tag === 'ul' ||
    tag === 'ol' ||
    tag === 'pre' ||
    tag === 'hr' ||
    tag === 'table' ||
    tag.match(/^h[1-6]$/) !== null
  )
}

export const tableHeaderSpec = makeCellSpec('tableHeader', 'th')
export const tableCellSpec = makeCellSpec('tableCell', 'td')

export const ComarkTableHeader = Node.create({
  name: 'tableHeader',
  content: 'block+',
  tableRole: 'header_cell',
  isolating: true,

  addAttributes() {
    return {
      colspan: { default: 1, parseHTML: (el) => Number(el.getAttribute('colspan') ?? 1) },
      rowspan: { default: 1, parseHTML: (el) => Number(el.getAttribute('rowspan') ?? 1) },
      colwidth: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('colwidth')
          if (!raw) return null
          return raw.split(',').map((n) => Number(n))
        },
      },
      ...htmlAttrSpec({ reserved: CELL_SEMANTIC as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'th' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: tableHeaderSpec }
  },
})

export const ComarkTableCell = Node.create({
  name: 'tableCell',
  content: 'block+',
  tableRole: 'cell',
  isolating: true,

  addAttributes() {
    return {
      colspan: { default: 1, parseHTML: (el) => Number(el.getAttribute('colspan') ?? 1) },
      rowspan: { default: 1, parseHTML: (el) => Number(el.getAttribute('rowspan') ?? 1) },
      colwidth: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('colwidth')
          if (!raw) return null
          return raw.split(',').map((n) => Number(n))
        },
      },
      ...htmlAttrSpec({ reserved: CELL_SEMANTIC as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'td' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: tableCellSpec }
  },
})
