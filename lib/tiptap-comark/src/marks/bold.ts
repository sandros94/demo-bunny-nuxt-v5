/**
 * `bold` — the `<strong>` mark, with first-class HTML attrs.
 *
 * Comark accepts both `<strong>` and `<b>` on the parse side; on the render
 * side we always emit `<strong>` since that's what `comark/render` expects
 * for `**bold**` markdown.
 *
 * `**bold**{.foo}` round-trips losslessly because `class` is a real
 * attribute on the bold mark schema (via `htmlAttrs`).
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkNode, MarkSpec, PMMark } from '../types'

export const boldSpec: MarkSpec = {
  pmName: 'bold',
  tags: ['strong', 'b'],

  toComark(mark: PMMark, child: ComarkNode): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (mark.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['strong', attrs, child]
  },

  fromComark(el: ComarkElement): PMMark {
    const [, rawAttrs] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    if (Object.keys(htmlAttrs).length === 0) return { type: 'bold' }
    return { type: 'bold', attrs: { htmlAttrs } }
  },
}

export const ComarkBold = Mark.create({
  name: 'bold',

  addAttributes() {
    return {
      ...htmlAttrSpec(),
    }
  },

  parseHTML() {
    return [
      { tag: 'strong' },
      { tag: 'b', getAttrs: (node) => (node as HTMLElement).style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === this.name },
      {
        style: 'font-weight',
        getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value as string) && null,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['strong', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-b': () => this.editor.commands.toggleMark(this.name),
      'Mod-B': () => this.editor.commands.toggleMark(this.name),
    }
  },

  addStorage() {
    return { comark: boldSpec }
  },
})
