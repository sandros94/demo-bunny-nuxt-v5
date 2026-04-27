/**
 * `codeBlock` — fenced code with all of Comark's metadata as first-class
 * schema attrs:
 *
 *   ```ts [example.ts] {1,3-5} meta=foo
 *   …
 *   ```
 *
 * Comark shape:
 *   ['pre', { language, filename, highlights, meta, …html }, ['code', { class }, '…']]
 *
 * Native PM attrs: `language`, `filename`, `highlights`, `meta`. Plus
 * `htmlAttrs` for everything else on the `<pre>`. The inner `<code>`'s
 * `class` is regenerated as `language-{lang}` on the way out and stripped
 * on the way in (it's derivable from `language` and would otherwise duplicate).
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkHelpers, JSONContent, NodeSpec } from '../types'

const SEMANTIC_KEYS = ['language', 'filename', 'highlights', 'meta'] as const

export const codeBlockSpec: NodeSpec = {
  pmName: 'codeBlock',
  tags: ['pre'],

  toComark(node: JSONContent): ComarkElement {
    const semantic: Record<string, unknown> = {}
    if (node.attrs?.language) semantic.language = node.attrs.language
    if (node.attrs?.filename) semantic.filename = node.attrs.filename
    if (Array.isArray(node.attrs?.highlights) && node.attrs.highlights.length > 0) {
      semantic.highlights = node.attrs.highlights
    }
    if (node.attrs?.meta) semantic.meta = node.attrs.meta

    const preAttrs = mergeAttrs(
      semantic,
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )

    const text = (node.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('')

    const codeAttrs: Record<string, unknown> = {}
    if (node.attrs?.language) codeAttrs.class = `language-${node.attrs.language}`
    // codeHtmlAttrs are kept separate so users can style/decorate the inner
    // `<code>` independently of the outer `<pre>`.
    const codeHtmlAttrs = node.attrs?.codeHtmlAttrs as Record<string, unknown> | undefined
    if (codeHtmlAttrs) {
      for (const [k, v] of Object.entries(codeHtmlAttrs)) {
        if (v === null || v === undefined) continue
        if (k === 'class' && v === codeAttrs.class) continue
        codeAttrs[k] = v
      }
    }

    return ['pre', preAttrs, ['code', codeAttrs, text] as ComarkElement]
  },

  fromComark(el: ComarkElement, _h: ComarkHelpers): JSONContent {
    const [, rawAttrs, ...children] = el

    // Inner <code> may or may not be present. Real-world Comark always emits
    // it; defensive code handles AST authored by hand without one.
    const inner = children.find((c): c is ComarkElement => Array.isArray(c) && c[0] === 'code')
    let text = ''
    let codeAttrs: ComarkElement[1] | undefined
    if (inner) {
      codeAttrs = inner[1]
      for (const c of inner.slice(2) as unknown[]) {
        if (typeof c === 'string') text += c
      }
    } else {
      for (const c of children) if (typeof c === 'string') text += c
    }

    const { semantic, htmlAttrs } = splitAttrs(rawAttrs, SEMANTIC_KEYS)

    const attrs: Record<string, unknown> = {}
    if (typeof semantic.language === 'string') attrs.language = semantic.language
    if (typeof semantic.filename === 'string') attrs.filename = semantic.filename
    if (Array.isArray(semantic.highlights)) attrs.highlights = semantic.highlights
    if (semantic.meta != null) attrs.meta = semantic.meta
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs

    // Capture inner-<code> attrs that aren't `language-{lang}`.
    if (codeAttrs) {
      const codeHtmlAttrs: Record<string, unknown> = {}
      const lang = typeof attrs.language === 'string' ? attrs.language : ''
      for (const [k, v] of Object.entries(codeAttrs)) {
        if (k === '$') continue
        if (v === null || v === undefined) continue
        if (k === 'class' && lang && v === `language-${lang}`) continue
        codeHtmlAttrs[k] = v
      }
      if (Object.keys(codeHtmlAttrs).length > 0) attrs.codeHtmlAttrs = codeHtmlAttrs
    }

    const out: JSONContent = { type: 'codeBlock' }
    if (Object.keys(attrs).length > 0) out.attrs = attrs
    if (text.length > 0) out.content = [{ type: 'text', text }]
    return out
  },
}

export const ComarkCodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (el) => {
          const code = el.querySelector('code')
          const cls = code?.getAttribute('class') ?? ''
          const m = /language-(\S+)/.exec(cls)
          return m ? m[1] : null
        },
        renderHTML: () => ({}),
      },
      filename: { default: null, renderHTML: () => ({}) },
      highlights: { default: null, renderHTML: () => ({}) },
      meta: { default: null, renderHTML: () => ({}) },
      codeHtmlAttrs: { default: null, renderHTML: () => ({}) },
      ...htmlAttrSpec({ reserved: SEMANTIC_KEYS as unknown as string[] }),
    }
  },

  parseHTML() {
    return [{ tag: 'pre' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const lang = node.attrs.language as string | null | undefined
    return [
      'pre',
      mergeAttributes(HTMLAttributes),
      ['code', lang ? { class: `language-${lang}` } : {}, 0],
    ]
  },

  addStorage() {
    return { comark: codeBlockSpec }
  },
})
