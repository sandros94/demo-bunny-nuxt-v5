/**
 * tiptap-comark
 * ----------------------------------------------------------------------------
 * Framework-agnostic Tiptap <-> Comark AST bridge.
 *
 * Public API:
 *   - comarkToProseMirror(tree, options?) — Comark AST → ProseMirror JSON doc
 *   - proseMirrorToComark(doc, options?)  — ProseMirror JSON doc → Comark AST
 *   - ComarkExtension                      — optional Tiptap Extension w/ a
 *                                            `setComarkContent` command
 *   - getComarkFromEditor(editor, options?) — extract Comark AST from a live
 *                                              Tiptap editor in one call
 *
 * Standard PM types covered out of the box (StarterKit + table extension):
 *   nodes: doc, paragraph, text, heading, bulletList, orderedList, listItem,
 *          blockquote, codeBlock, horizontalRule, hardBreak, image,
 *          table, tableRow, tableHeader, tableCell, comarkTemplate
 *   marks: bold, italic, code, strike, link
 *
 * Anything else (Comark components like `::alert`, `:badge`) routes through
 * `nodeHandlers` / `markHandlers` / `pmNodeHandlers` from `ConvertOptions`.
 *
 * --- Round-trip integrity ---------------------------------------------------
 *
 * Comark allows arbitrary attributes on every element (`{.foo}`, `{#id}`,
 * `{key="val"}`). Tiptap's standard schemas only know a small subset
 * (`level` on heading, `start` on orderedList, `href`/`title` on link, etc.).
 * To stay non-destructive, every attribute we don't have a native schema slot
 * for is stashed under `attrs.comarkExtras` on the PM node/mark and splatted
 * back onto the Comark element on the way back.
 *
 * Comark's internal `$` metadata (line/html/block) is dropped on the way in
 * and never re-emitted — it's a parser bookkeeping field, not user content.
 *
 * To make `comarkExtras` survive Tiptap's schema validation in a live editor,
 * register a Tiptap extension that adds `comarkExtras` to each standard
 * node/mark (the `tiptap-comark-nuxt` companion ships one as `ComarkAttrs`).
 * ----------------------------------------------------------------------------
 */

import { Extension } from '@tiptap/core'

// ===========================================================================
// Comark AST types — mirror upstream `comark` exactly so the converter can be
// dropped into the upstream package without an `as unknown as` cast.
// ===========================================================================

export type ComarkText = string

export interface ComarkElementAttributes {
  [key: string]: unknown
  /** Comark's internal source-position metadata. Stripped on conversion. */
  $?: { line?: number; html?: 0 | 1; block?: 0 | 1 }
}

export type ComarkElement = [string, ComarkElementAttributes, ...ComarkNode[]]
export type ComarkComment = [null, ComarkElementAttributes, string]
export type ComarkNode = ComarkElement | ComarkText | ComarkComment

export interface ComarkTree {
  nodes: ComarkNode[]
  frontmatter: Record<string, any>
  meta: Record<string, any>
}

// ===========================================================================
// ProseMirror JSON shape — structural; no runtime dep on prosemirror-model
// ===========================================================================

export interface PMMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: PMMark[]
  text?: string
}

// ===========================================================================
// Type guards
// ===========================================================================

const isElement = (n: ComarkNode): n is ComarkElement =>
  Array.isArray(n) && typeof n[0] === 'string'
const isComment = (n: ComarkNode): n is ComarkComment => Array.isArray(n) && n[0] === null
const isText = (n: ComarkNode): n is ComarkText => typeof n === 'string'

// ===========================================================================
// Tag tables
// ===========================================================================

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const MARK_TAGS: Record<string, string> = {
  strong: 'bold',
  b: 'bold',
  em: 'italic',
  i: 'italic',
  s: 'strike',
  del: 'strike',
  code: 'code',
  a: 'link',
}

// ===========================================================================
// Conversion options
// ===========================================================================

export interface ConvertOptions {
  /** Map a Comark element (block context) to a PM node. Return null to drop. */
  nodeHandlers?: Record<
    string,
    (el: ComarkElement, convertChildren: (children: ComarkNode[]) => PMNode[]) => PMNode | null
  >
  /** Map an unknown Comark inline element to a PM mark. Return null to drop. */
  markHandlers?: Record<string, (el: ComarkElement) => PMMark | null>
  /** Map a PM node back to a Comark node. Return null to drop. */
  pmNodeHandlers?: Record<
    string,
    (node: PMNode, convertChildren: (children: PMNode[]) => ComarkNode[]) => ComarkNode | null
  >
  /**
   * Mirror Comark's parser-level `autoUnwrap` on serialize. When a registered
   * component's children collapse to a single empty-attr paragraph, emit its
   * inlines as direct children of the component (matches Comark's default).
   * @default true
   */
  autoUnwrap?: boolean
}

// ===========================================================================
// Attribute helpers — the carrier convention for non-standard attrs
// ===========================================================================

const EXTRAS_KEY = 'comarkExtras'

/**
 * Split user attrs into:
 *   - `standard`: keys claimed natively by the PM schema (e.g. `level`)
 *   - `extras`:   everything else (`id`, `class`, custom data attrs, …)
 *
 * Drops Comark's internal `$` metadata and any `null`/`undefined` entries so
 * the AST stays tidy.
 */
function splitAttrs(
  attrs: ComarkElementAttributes | undefined,
  standardKeys: readonly string[] = [],
): { standard: Record<string, unknown>; extras: Record<string, unknown> } {
  const standard: Record<string, unknown> = {}
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === '$') continue
    if (v === null || v === undefined) continue
    if (standardKeys.includes(k)) standard[k] = v
    else extras[k] = v
  }
  return { standard, extras }
}

/** Merge extras (if any) onto a PM attrs object. */
function attrsWithExtras<T extends Record<string, unknown>>(
  base: T,
  extras: Record<string, unknown>,
): T | (T & { [EXTRAS_KEY]: Record<string, unknown> }) {
  if (Object.keys(extras).length === 0) return base
  return { ...base, [EXTRAS_KEY]: extras }
}

/** Read the `comarkExtras` carrier off a PM attrs bag. */
function readExtras(pmAttrs: Record<string, unknown> | undefined): Record<string, unknown> {
  const raw = pmAttrs?.[EXTRAS_KEY]
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

/** Compose Comark element attrs from a base + extras (for the inverse path). */
function comarkAttrs(
  base: ComarkElementAttributes,
  extras: Record<string, unknown>,
): ComarkElementAttributes {
  const out: ComarkElementAttributes = { ...base }
  for (const [k, v] of Object.entries(extras)) {
    if (v === null || v === undefined) continue
    out[k] = v
  }
  return out
}

/** Produce a PM `attrs` field, omitting it entirely when empty. */
function maybeAttrs(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(attrs).length > 0 ? attrs : undefined
}

// ===========================================================================
// Comark AST  ->  ProseMirror JSON
// ===========================================================================

export function comarkToProseMirror(tree: ComarkTree, options: ConvertOptions = {}): PMNode {
  const content = tree.nodes
    .map((n) => convertBlock(n, options))
    .filter((n): n is PMNode => n !== null)

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  }
}

function convertBlock(node: ComarkNode, opts: ConvertOptions): PMNode | null {
  if (isComment(node)) return null
  if (isText(node)) {
    return node.length === 0 ? null : { type: 'paragraph', content: [{ type: 'text', text: node }] }
  }

  const [tag, rawAttrs, ...children] = node

  if (HEADING_TAGS.has(tag)) {
    const { extras } = splitAttrs(rawAttrs)
    return {
      type: 'heading',
      attrs: attrsWithExtras({ level: Number(tag[1]) }, extras),
      content: convertInlines(children, opts),
    }
  }

  switch (tag) {
    case 'p': {
      const { extras } = splitAttrs(rawAttrs)
      const out: PMNode = { type: 'paragraph', content: convertInlines(children, opts) }
      if (Object.keys(extras).length > 0) out.attrs = { [EXTRAS_KEY]: extras }
      return out
    }

    case 'blockquote': {
      const { extras } = splitAttrs(rawAttrs)
      const out: PMNode = {
        type: 'blockquote',
        content: children.map((c) => convertBlock(c, opts)).filter((c): c is PMNode => c !== null),
      }
      if (Object.keys(extras).length > 0) out.attrs = { [EXTRAS_KEY]: extras }
      return out
    }

    case 'ul': {
      const { extras } = splitAttrs(rawAttrs)
      const out: PMNode = {
        type: 'bulletList',
        content: children.filter(isElement).map((c) => convertListItem(c, opts)),
      }
      if (Object.keys(extras).length > 0) out.attrs = { [EXTRAS_KEY]: extras }
      return out
    }

    case 'ol': {
      const { standard, extras } = splitAttrs(rawAttrs, ['start'])
      const base: Record<string, unknown> = {}
      if (standard.start != null) base.start = Number(standard.start)
      return {
        type: 'orderedList',
        attrs: maybeAttrs(attrsWithExtras(base, extras)),
        content: children.filter(isElement).map((c) => convertListItem(c, opts)),
      }
    }

    case 'pre':
      return convertCodeBlock(node)

    case 'hr': {
      const { extras } = splitAttrs(rawAttrs)
      const out: PMNode = { type: 'horizontalRule' }
      if (Object.keys(extras).length > 0) out.attrs = { [EXTRAS_KEY]: extras }
      return out
    }

    case 'img': {
      const { standard, extras } = splitAttrs(rawAttrs, ['src', 'alt', 'title'])
      return {
        type: 'image',
        attrs: attrsWithExtras(
          {
            src: (standard.src as string | undefined) ?? '',
            alt: (standard.alt as string | null | undefined) ?? null,
            title: (standard.title as string | null | undefined) ?? null,
          },
          extras,
        ),
      }
    }

    case 'table':
      return convertTable(node, opts)

    case 'template':
      return convertTemplate(node, opts)
  }

  // Custom / component tag — defer to user handler
  const handler = opts.nodeHandlers?.[tag]
  if (handler) {
    return handler(node, (kids) =>
      kids.map((c) => convertBlock(c, opts)).filter((c): c is PMNode => c !== null),
    )
  }

  // Fallback: treat unknown as a paragraph of its inlined text, so nothing is
  // lost. Drop the wrapper element entirely if there's nothing to render.
  const inlines = convertInlines(children, opts)
  return inlines.length > 0 ? { type: 'paragraph', content: inlines } : null
}

function convertListItem(el: ComarkElement, opts: ConvertOptions): PMNode {
  const [, attrs, ...children] = el
  const { extras } = splitAttrs(attrs)
  let content = convertMixedBlockChildren(children, opts)
  if (content.length === 0) content = [{ type: 'paragraph' }]
  const out: PMNode = { type: 'listItem', content }
  if (Object.keys(extras).length > 0) out.attrs = { [EXTRAS_KEY]: extras }
  return out
}

/**
 * Convert a sequence of Comark children that mixes inline and block nodes
 * (typical of `<li>` and table cells in real-world markdown) into PM block
 * content, grouping consecutive inlines into a single paragraph.
 */
function convertMixedBlockChildren(children: ComarkNode[], opts: ConvertOptions): PMNode[] {
  const content: PMNode[] = []
  let inlineBuffer: ComarkNode[] = []

  const flush = () => {
    if (inlineBuffer.length === 0) return
    const inlines = convertInlines(inlineBuffer, opts)
    if (inlines.length > 0) content.push({ type: 'paragraph', content: inlines })
    inlineBuffer = []
  }

  for (const child of children) {
    if (isComment(child)) continue
    if (isText(child)) {
      inlineBuffer.push(child)
      continue
    }
    const [childTag] = child
    if (MARK_TAGS[childTag] || childTag === 'br' || childTag === 'img') {
      inlineBuffer.push(child)
    } else {
      flush()
      const block = convertBlock(child, opts)
      if (block) content.push(block)
    }
  }
  flush()
  return content
}

function convertCodeBlock(node: ComarkElement): PMNode {
  const [, attrs, ...children] = node
  // Comark shape: ["pre", { language, filename?, highlights?, meta? },
  //                 ["code", { class? }, "text..."]]
  let text = ''
  let codeAttrs: ComarkElementAttributes | undefined
  const inner = children.find(isElement)
  if (inner && inner[0] === 'code') {
    codeAttrs = inner[1]
    for (const c of inner.slice(2) as ComarkNode[]) if (isText(c)) text += c
  } else {
    for (const c of children) if (isText(c)) text += c
  }

  const { standard, extras } = splitAttrs(attrs, ['language'])
  if (codeAttrs) {
    const lang = typeof standard.language === 'string' ? standard.language : ''
    const codeOnly: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(codeAttrs)) {
      if (k === '$') continue
      // The class is derivable from `language` (`language-xxx`); skip it so
      // we don't double-emit on the way back.
      if (k === 'class' && lang && v === `language-${lang}`) continue
      if (v === null || v === undefined) continue
      codeOnly[k] = v
    }
    if (Object.keys(codeOnly).length > 0) extras.codeAttrs = codeOnly
  }

  const pmAttrs: Record<string, unknown> = {
    language: (standard.language as string | undefined) ?? null,
  }

  return {
    type: 'codeBlock',
    attrs: attrsWithExtras(pmAttrs, extras),
    content: text.length > 0 ? [{ type: 'text', text }] : undefined,
  }
}

function convertTemplate(node: ComarkElement, opts: ConvertOptions): PMNode {
  const [, attrs, ...children] = node
  const { standard, extras } = splitAttrs(attrs, ['name'])
  const childPM = children.map((c) => convertBlock(c, opts)).filter((c): c is PMNode => c !== null)
  return {
    type: 'comarkTemplate',
    attrs: attrsWithExtras({ name: (standard.name as string | undefined) ?? null }, extras),
    content: childPM.length > 0 ? childPM : [{ type: 'paragraph' }],
  }
}

function convertTable(node: ComarkElement, opts: ConvertOptions): PMNode {
  const [, attrs, ...children] = node
  const { extras } = splitAttrs(attrs)

  // Comark shape: ["table", attrs, ["thead", {}, ...rows], ["tbody", {}, ...rows]]
  // — but a stripped-down ["table", {}, ...rows] is also tolerated. Header
  // rows are tracked so we can re-group them on the way back out.
  const rows: PMNode[] = []
  for (const child of children) {
    if (!isElement(child)) continue
    const [childTag] = child
    if (childTag === 'thead' || childTag === 'tbody') {
      for (const row of child.slice(2) as ComarkNode[]) {
        if (isElement(row) && row[0] === 'tr') rows.push(convertTableRow(row, opts))
      }
    } else if (childTag === 'tr') {
      rows.push(convertTableRow(child, opts))
    }
  }

  return {
    type: 'table',
    attrs: maybeAttrs(attrsWithExtras({}, extras)),
    content: rows,
  }
}

function convertTableRow(row: ComarkElement, opts: ConvertOptions): PMNode {
  const [, attrs, ...cells] = row
  const { extras } = splitAttrs(attrs)
  return {
    type: 'tableRow',
    attrs: maybeAttrs(attrsWithExtras({}, extras)),
    content: cells.filter(isElement).map((c) => convertTableCell(c, opts)),
  }
}

function convertTableCell(cell: ComarkElement, opts: ConvertOptions): PMNode {
  const [tag, attrs, ...children] = cell
  const isHeader = tag === 'th'
  // Tiptap's table cells natively schema colspan / rowspan / colwidth.
  // Alignment (and any other Comark-only attrs) ride along under extras.
  const { standard, extras } = splitAttrs(attrs, ['colspan', 'rowspan', 'colwidth'])
  const pmAttrs: Record<string, unknown> = {}
  // colspan/rowspan default to 1; emitting it would force the inverse path
  // to either re-emit a redundant `=1` attribute or drop information.
  if (standard.colspan != null && Number(standard.colspan) !== 1) {
    pmAttrs.colspan = Number(standard.colspan)
  }
  if (standard.rowspan != null && Number(standard.rowspan) !== 1) {
    pmAttrs.rowspan = Number(standard.rowspan)
  }
  if (standard.colwidth != null) pmAttrs.colwidth = standard.colwidth

  let content = convertMixedBlockChildren(children, opts)
  if (content.length === 0) content = [{ type: 'paragraph' }]

  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    attrs: maybeAttrs(attrsWithExtras(pmAttrs, extras)),
    content,
  }
}

// ----- inlines -------------------------------------------------------------

function convertInlines(
  children: ComarkNode[],
  opts: ConvertOptions,
  marks: PMMark[] = [],
): PMNode[] {
  const out: PMNode[] = []

  for (const child of children) {
    if (isComment(child)) continue

    if (isText(child)) {
      if (child.length > 0) {
        out.push({
          type: 'text',
          text: child,
          ...(marks.length > 0 ? { marks: [...marks] } : {}),
        })
      }
      continue
    }

    const [tag, attrs, ...kids] = child

    if (tag === 'br') {
      out.push({ type: 'hardBreak' })
      continue
    }

    if (tag === 'img') {
      const { standard, extras } = splitAttrs(attrs, ['src', 'alt', 'title'])
      out.push({
        type: 'image',
        attrs: attrsWithExtras(
          {
            src: (standard.src as string | undefined) ?? '',
            alt: (standard.alt as string | null | undefined) ?? null,
            title: (standard.title as string | null | undefined) ?? null,
          },
          extras,
        ),
        ...(marks.length > 0 ? { marks: [...marks] } : {}),
      })
      continue
    }

    const markType = MARK_TAGS[tag]
    if (markType) {
      const mark = buildMark(markType, attrs)
      out.push(...convertInlines(kids, opts, [...marks, mark]))
      continue
    }

    // Custom inline node (e.g. `:badge[New]{color="green"}`)
    const nodeHandler = opts.nodeHandlers?.[tag]
    if (nodeHandler) {
      // Inline-context `convertChildren` so string children become text
      // nodes, not paragraphs. This is the crucial difference from the
      // call site in `convertBlock`.
      const pmNode = nodeHandler(child, (kids) => convertInlines(kids, opts, []))
      if (pmNode) {
        out.push(
          marks.length > 0 ? { ...pmNode, marks: [...marks, ...(pmNode.marks ?? [])] } : pmNode,
        )
      }
      continue
    }

    // Custom inline mark handler (wraps children with a mark)
    const handler = opts.markHandlers?.[tag]
    if (handler) {
      const mark = handler(child)
      if (mark) {
        out.push(...convertInlines(kids, opts, [...marks, mark]))
        continue
      }
    }

    // Unknown inline — splat children flatly so nothing is lost
    out.push(...convertInlines(kids, opts, marks))
  }

  return out
}

function buildMark(type: string, attrs: ComarkElementAttributes): PMMark {
  if (type === 'link') {
    const { standard, extras } = splitAttrs(attrs, ['href', 'title'])
    const linkAttrs: Record<string, unknown> = {
      href: (standard.href as string | undefined) ?? '',
      title: (standard.title as string | null | undefined) ?? null,
    }
    return Object.keys(extras).length > 0
      ? { type, attrs: { ...linkAttrs, [EXTRAS_KEY]: extras } }
      : { type, attrs: linkAttrs }
  }
  // bold / italic / strike / code — no native attrs
  const { extras } = splitAttrs(attrs)
  return Object.keys(extras).length > 0 ? { type, attrs: { [EXTRAS_KEY]: extras } } : { type }
}

// ===========================================================================
// ProseMirror JSON  ->  Comark AST
// ===========================================================================

export function proseMirrorToComark(doc: PMNode, options: ConvertOptions = {}): ComarkTree {
  if (doc.type !== 'doc') {
    throw new Error(`Expected PM doc node, got "${doc.type}"`)
  }
  const nodes = (doc.content ?? [])
    .map((n) => pmBlockToComark(n, options))
    .filter((n): n is ComarkNode => n !== null)

  return { nodes, frontmatter: {}, meta: {} }
}

function pmBlockToComark(node: PMNode, opts: ConvertOptions = {}): ComarkNode | null {
  // User-registered PM node (custom components) take priority over defaults
  const custom = opts.pmNodeHandlers?.[node.type]
  if (custom) {
    const result = custom(node, (kids) =>
      kids.map((k) => pmBlockToComark(k, opts)).filter((k): k is ComarkNode => k !== null),
    )
    return result === null ? null : maybeAutoUnwrap(result, opts)
  }

  switch (node.type) {
    case 'paragraph': {
      const extras = readExtras(node.attrs)
      return ['p', comarkAttrs({}, extras), ...pmInlinesToComark(node.content ?? [], opts)]
    }

    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      const extras = readExtras(node.attrs)
      return [`h${level}`, comarkAttrs({}, extras), ...pmInlinesToComark(node.content ?? [], opts)]
    }

    case 'blockquote': {
      const extras = readExtras(node.attrs)
      return [
        'blockquote',
        comarkAttrs({}, extras),
        ...(node.content ?? [])
          .map((c) => pmBlockToComark(c, opts))
          .filter((c): c is ComarkNode => c !== null),
      ]
    }

    case 'bulletList': {
      const extras = readExtras(node.attrs)
      return [
        'ul',
        comarkAttrs({}, extras),
        ...(node.content ?? []).map((c) => pmListItemToComark(c, opts)),
      ]
    }

    case 'orderedList': {
      const extras = readExtras(node.attrs)
      const base: ComarkElementAttributes = {}
      if (node.attrs?.start != null && node.attrs.start !== 1) {
        base.start = node.attrs.start
      }
      return [
        'ol',
        comarkAttrs(base, extras),
        ...(node.content ?? []).map((c) => pmListItemToComark(c, opts)),
      ]
    }

    case 'codeBlock': {
      const lang = (node.attrs?.language as string | null) ?? undefined
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      const allExtras = readExtras(node.attrs)
      const { codeAttrs: extraCodeAttrs, ...preExtras } = allExtras

      const preBase: ComarkElementAttributes = lang ? { language: lang } : {}
      const preAttrs = comarkAttrs(preBase, preExtras as Record<string, unknown>)

      const codeOut: ComarkElementAttributes = {}
      if (lang) codeOut.class = `language-${lang}`
      if (extraCodeAttrs && typeof extraCodeAttrs === 'object') {
        for (const [k, v] of Object.entries(extraCodeAttrs as Record<string, unknown>)) {
          if (v === null || v === undefined) continue
          codeOut[k] = v
        }
      }
      return ['pre', preAttrs, ['code', codeOut, text] as ComarkElement]
    }

    case 'horizontalRule': {
      const extras = readExtras(node.attrs)
      return ['hr', comarkAttrs({}, extras)]
    }

    case 'image': {
      const extras = readExtras(node.attrs)
      const base: ComarkElementAttributes = { src: (node.attrs?.src as string) ?? '' }
      if (node.attrs?.alt) base.alt = node.attrs.alt
      if (node.attrs?.title) base.title = node.attrs.title
      return ['img', comarkAttrs(base, extras)]
    }

    case 'table':
      return pmTableToComark(node, opts)

    case 'comarkTemplate':
      return pmTemplateToComark(node, opts)

    default:
      // Unknown PM node — try to serialize its inline content into a paragraph
      if (node.content) {
        return ['p', {}, ...pmInlinesToComark(node.content, opts)]
      }
      return null
  }
}

function pmListItemToComark(item: PMNode, opts: ConvertOptions = {}): ComarkElement {
  const extras = readExtras(item.attrs)
  const content = item.content ?? []
  // Flatten: if listItem contains a single paragraph, inline its children
  if (content.length === 1 && content[0]?.type === 'paragraph') {
    return ['li', comarkAttrs({}, extras), ...pmInlinesToComark(content[0].content ?? [], opts)]
  }
  const children = content
    .map((c) => pmBlockToComark(c, opts))
    .filter((c): c is ComarkNode => c !== null)
  return ['li', comarkAttrs({}, extras), ...children]
}

function pmTemplateToComark(node: PMNode, opts: ConvertOptions): ComarkElement {
  const extras = readExtras(node.attrs)
  const base: ComarkElementAttributes = {}
  if (node.attrs?.name != null) base.name = node.attrs.name
  return [
    'template',
    comarkAttrs(base, extras),
    ...(node.content ?? [])
      .map((c) => pmBlockToComark(c, opts))
      .filter((c): c is ComarkNode => c !== null),
  ]
}

function pmTableToComark(node: PMNode, opts: ConvertOptions): ComarkElement {
  const extras = readExtras(node.attrs)
  // Group rows: a row whose cells are all `tableHeader` goes to `thead`,
  // others go to `tbody`. This matches Comark's emission shape, even though
  // Tiptap's table extension allows mixed rows internally.
  const headerRows: ComarkElement[] = []
  const bodyRows: ComarkElement[] = []
  for (const row of node.content ?? []) {
    const allHeaders =
      row.type === 'tableRow' &&
      (row.content?.length ?? 0) > 0 &&
      (row.content ?? []).every((c) => c.type === 'tableHeader')
    const comarkRow = pmTableRowToComark(row, opts)
    if (allHeaders) headerRows.push(comarkRow)
    else bodyRows.push(comarkRow)
  }

  const tableChildren: ComarkNode[] = []
  if (headerRows.length > 0) tableChildren.push(['thead', {}, ...headerRows])
  if (bodyRows.length > 0) tableChildren.push(['tbody', {}, ...bodyRows])
  return ['table', comarkAttrs({}, extras), ...tableChildren]
}

function pmTableRowToComark(row: PMNode, opts: ConvertOptions): ComarkElement {
  const extras = readExtras(row.attrs)
  return [
    'tr',
    comarkAttrs({}, extras),
    ...(row.content ?? []).map((c) => pmTableCellToComark(c, opts)),
  ]
}

function pmTableCellToComark(cell: PMNode, opts: ConvertOptions): ComarkElement {
  const tag = cell.type === 'tableHeader' ? 'th' : 'td'
  const extras = readExtras(cell.attrs)
  const base: ComarkElementAttributes = {}
  if (cell.attrs?.colspan != null && cell.attrs.colspan !== 1) base.colspan = cell.attrs.colspan
  if (cell.attrs?.rowspan != null && cell.attrs.rowspan !== 1) base.rowspan = cell.attrs.rowspan
  if (cell.attrs?.colwidth != null) base.colwidth = cell.attrs.colwidth

  const content = cell.content ?? []
  // A single paragraph inlines directly (the most common shape for markdown
  // tables). Anything else is serialized as a block sequence.
  let body: ComarkNode[]
  if (content.length === 1 && content[0]?.type === 'paragraph') {
    body = pmInlinesToComark(content[0].content ?? [], opts)
  } else {
    body = content.map((c) => pmBlockToComark(c, opts)).filter((c): c is ComarkNode => c !== null)
  }
  return [tag, comarkAttrs(base, extras), ...body]
}

function pmInlinesToComark(nodes: PMNode[], opts: ConvertOptions = {}): ComarkNode[] {
  const out: ComarkNode[] = []

  for (const n of nodes) {
    const custom = opts.pmNodeHandlers?.[n.type]
    if (custom) {
      const result = custom(n, (kids) => pmInlinesToComark(kids, opts))
      if (result !== null) out.push(maybeAutoUnwrap(result, opts))
      continue
    }

    if (n.type === 'hardBreak') {
      out.push(['br', {}])
      continue
    }
    if (n.type === 'image') {
      const extras = readExtras(n.attrs)
      const base: ComarkElementAttributes = { src: (n.attrs?.src as string) ?? '' }
      if (n.attrs?.alt) base.alt = n.attrs.alt
      if (n.attrs?.title) base.title = n.attrs.title
      out.push(['img', comarkAttrs(base, extras)])
      continue
    }
    if (n.type === 'text') {
      out.push(wrapWithMarks(n.text ?? '', n.marks ?? []))
      continue
    }
    // Unknown inline — best-effort: serialize raw text if present
    if (n.text) out.push(n.text)
  }

  return out
}

function wrapWithMarks(text: string, marks: PMMark[]): ComarkNode {
  // Apply marks outside-in so the innermost tag sits closest to the text
  let node: ComarkNode = text
  for (const m of marks) node = wrapMark(node, m)
  return node
}

function wrapMark(inner: ComarkNode, mark: PMMark): ComarkElement {
  const extras = readExtras(mark.attrs)
  switch (mark.type) {
    case 'bold':
      return ['strong', comarkAttrs({}, extras), inner]
    case 'italic':
      return ['em', comarkAttrs({}, extras), inner]
    case 'strike':
      return ['s', comarkAttrs({}, extras), inner]
    case 'code':
      return ['code', comarkAttrs({}, extras), inner]
    case 'link': {
      const base: ComarkElementAttributes = {
        href: (mark.attrs?.href as string) ?? '',
      }
      if (mark.attrs?.title) base.title = mark.attrs.title
      return ['a', comarkAttrs(base, extras), inner]
    }
    default:
      // Unknown mark — pass through as a span carrying the mark's name and
      // any extras so it's recoverable by a custom markHandler.
      return ['span', { 'data-mark': mark.type, ...extras }, inner]
  }
}

/**
 * Mirror Comark's parser-level `autoUnwrap`. When a registered component's
 * children collapse to a single empty-attr paragraph, emit its inlines as
 * direct children. Skips when the paragraph has `comarkExtras` (we'd lose
 * them) or when `autoUnwrap` is disabled.
 */
function maybeAutoUnwrap(node: ComarkNode, opts: ConvertOptions): ComarkNode {
  if (opts.autoUnwrap === false) return node
  if (!Array.isArray(node)) return node
  if (typeof node[0] !== 'string') return node // comments
  const [tag, attrs, ...children] = node
  if (children.length !== 1) return node
  const only = children[0]
  if (!Array.isArray(only) || only[0] !== 'p') return node
  const [, pAttrs, ...pChildren] = only
  // Only unwrap when the paragraph itself carries no user-visible attrs
  for (const k of Object.keys(pAttrs ?? {})) {
    if (k !== '$') return node
  }
  return [tag, attrs, ...pChildren] as ComarkElement
}

// ===========================================================================
// Tiptap Extension (optional convenience wrapper)
// ===========================================================================

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comark: {
      /** Replace editor content with a parsed Comark tree. */
      setComarkContent: (tree: ComarkTree) => ReturnType
    }
  }
}

export interface ComarkExtensionOptions extends ConvertOptions {}

export const ComarkExtension = Extension.create<ComarkExtensionOptions>({
  name: 'comark',

  addOptions() {
    return {}
  },

  addCommands() {
    return {
      setComarkContent:
        (tree: ComarkTree) =>
        ({ commands }) => {
          const doc = comarkToProseMirror(tree, this.options)
          return commands.setContent(doc, { emitUpdate: true })
        },
    }
  },
})

/**
 * Convenience helper: given a Tiptap editor, extract its current content as a
 * Comark AST. Kept as a free function so you can use the converters without
 * the Extension at all.
 *
 * Usage:
 *   import { getComarkFromEditor } from "./tiptap-comark";
 *   const tree = getComarkFromEditor(editor);
 */
export function getComarkFromEditor(
  editor: { getJSON: () => unknown },
  options: ConvertOptions = {},
): ComarkTree {
  return proseMirrorToComark(editor.getJSON() as PMNode, options)
}
