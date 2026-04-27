/**
 * `italic` — `<em>`/`<i>`. Always emits `<em>` on the way out.
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkNode, MarkSpec, PMMark } from '../types'

export const italicSpec: MarkSpec = {
  pmName: 'italic',
  tags: ['em', 'i'],

  toComark(mark: PMMark, child: ComarkNode): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (mark.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['em', attrs, child]
  },

  fromComark(el: ComarkElement): PMMark {
    const { htmlAttrs } = splitAttrs(el[1], [])
    return Object.keys(htmlAttrs).length > 0
      ? { type: 'italic', attrs: { htmlAttrs } }
      : { type: 'italic' }
  },
}

export const ComarkItalic = Mark.create({
  name: 'italic',

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [
      { tag: 'em' },
      { tag: 'i', getAttrs: (node) => (node as HTMLElement).style.fontStyle !== 'normal' && null },
      { style: 'font-style=normal', clearMark: (m) => m.type.name === this.name },
      { style: 'font-style=italic' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['em', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-i': () => this.editor.commands.toggleMark(this.name),
      'Mod-I': () => this.editor.commands.toggleMark(this.name),
    }
  },

  addStorage() {
    return { comark: italicSpec }
  },
})
