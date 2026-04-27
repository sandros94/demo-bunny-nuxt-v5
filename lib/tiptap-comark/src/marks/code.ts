/**
 * `code` — inline code mark. Distinct from the `codeBlock` node; this is
 * the `` `inline` `` form. Comark allows attrs (`{.lang}`) which ride on
 * `htmlAttrs`.
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkNode, MarkSpec, PMMark } from '../types'

export const codeSpec: MarkSpec = {
  pmName: 'code',
  tags: ['code'],

  toComark(mark: PMMark, child: ComarkNode): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (mark.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['code', attrs, child]
  },

  fromComark(el: ComarkElement): PMMark {
    const { htmlAttrs } = splitAttrs(el[1], [])
    return Object.keys(htmlAttrs).length > 0
      ? { type: 'code', attrs: { htmlAttrs } }
      : { type: 'code' }
  },
}

export const ComarkCode = Mark.create({
  name: 'code',
  excludes: '_',
  code: true,
  exitable: true,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'code' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['code', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-e': () => this.editor.commands.toggleMark(this.name),
      'Mod-E': () => this.editor.commands.toggleMark(this.name),
    }
  },

  addStorage() {
    return { comark: codeSpec }
  },
})
