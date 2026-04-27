/**
 * `hardBreak` — inline atom mapping to Comark `<br>` (markdown two-space
 * line break or explicit `\\` at end of line).
 */

import { Node, mergeAttributes } from '@tiptap/core'
import { mergeAttrs, splitAttrs } from '../utils/attrs'
import { htmlAttrSpec } from '../utils/html-attrs'
import type { ComarkElement, JSONContent, NodeSpec } from '../types'

export const hardBreakSpec: NodeSpec = {
  pmName: 'hardBreak',
  tags: ['br'],
  context: 'inline',

  toComark(node: JSONContent): ComarkElement {
    const attrs = mergeAttrs(
      {},
      (node.attrs?.htmlAttrs as Record<string, unknown> | undefined) ?? {},
    )
    return ['br', attrs]
  },

  fromComark(el: ComarkElement): JSONContent {
    const [, rawAttrs] = el
    const { htmlAttrs } = splitAttrs(rawAttrs, [])
    const out: JSONContent = { type: 'hardBreak' }
    if (Object.keys(htmlAttrs).length > 0) out.attrs = { htmlAttrs }
    return out
  },
}

export const ComarkHardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,

  addAttributes() {
    return { ...htmlAttrSpec() }
  },

  parseHTML() {
    return [{ tag: 'br' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['br', mergeAttributes(HTMLAttributes)]
  },

  addKeyboardShortcuts() {
    // Inserting a hardBreak is enough on its own — Tiptap will handle
    // exit-from-code and mark-keepalive via its existing `Enter` and
    // `Shift-Enter` plugins on whatever extension owns those.
    const insert = () => this.editor.commands.insertContent({ type: this.name })
    return {
      'Mod-Enter': insert,
      'Shift-Enter': insert,
    }
  },

  addStorage() {
    return { comark: hardBreakSpec }
  },
})
