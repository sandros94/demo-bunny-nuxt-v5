/**
 * `link` — `<a>` mark. `href` and `title` are semantic (declared as native
 * PM attrs); everything else (`target`, `rel`, `class`, `id`, custom data
 * attrs) rides on `htmlAttrs`.
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkNode, MarkSpec, PMMark } from '../types'

const SEMANTIC_KEYS = ['href', 'title'] as const

export const linkSpec: MarkSpec = {
  pmName: 'link',
  tags: ['a'],

  toComark(mark: PMMark, child: ComarkNode): ComarkElement {
    const attrs = mergeAttrs(
      {
        href: (mark.attrs?.href as string | undefined) ?? '',
        ...(mark.attrs?.title ? { title: mark.attrs.title } : {}),
      },
      (mark.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['a', attrs, child]
  },

  fromComark(el: ComarkElement): PMMark {
    const { semantic, htmlAttrs } = splitAttrs(el[1], SEMANTIC_KEYS)
    const attrs: Record<string, unknown> = {
      href: (semantic.href as string | undefined) ?? '',
      title: (semantic.title as string | null | undefined) ?? null,
    }
    if (Object.keys(htmlAttrs).length > 0) attrs.htmlAttrs = htmlAttrs
    return { type: 'link', attrs }
  },
}

export const ComarkLink = Mark.create({
  name: 'link',
  inclusive: false,
  exitable: true,

  addAttributes() {
    return {
      href: {
        default: '',
        parseHTML: (el) => el.getAttribute('href') ?? '',
        renderHTML: (attrs) => (attrs.href ? { href: attrs.href as string } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('title'),
        renderHTML: (attrs) => (attrs.title ? { title: attrs.title as string } : {}),
      },
      ...htmlAttrSpec({ reserved: ['href', 'title'] }),
    }
  },

  parseHTML() {
    return [{ tag: 'a[href]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), 0]
  },

  addStorage() {
    return { comark: linkSpec }
  },
})
