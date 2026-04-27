/**
 * `strike` — `<s>`/`<del>`. Emits `<del>` on the way out (matches what
 * Comark's parser produces for `~~text~~`).
 */

import { Mark, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, ComarkNode, MarkSpec, PMMark } from '../types'

export const strikeSpec: MarkSpec = {
  pmName: 'strike',
  tags: ['s', 'del'],

  toComark(mark: PMMark, child: ComarkNode): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (mark.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['del', attrs, child]
  },

  fromComark(el: ComarkElement): PMMark {
    const { htmlAttrs } = splitAttrs(el[1], [])
    return Object.keys(htmlAttrs).length > 0
      ? { type: 'strike', attrs: { htmlAttrs } }
      : { type: 'strike' }
  },
}

export const ComarkStrike = Mark.create({
  name: 'strike',

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [
      { tag: 's' },
      { tag: 'del' },
      { tag: 'strike' },
      { style: 'text-decoration=line-through' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['s', mergeAttributes(HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-s': () => this.editor.commands.toggleMark(this.name),
      'Mod-Shift-S': () => this.editor.commands.toggleMark(this.name),
    }
  },

  addStorage() {
    return { comark: strikeSpec }
  },
})
