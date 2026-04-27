/**
 * `ComarkKit` — the bundled set of extensions you'll want by default.
 *
 *   import { Editor } from '@tiptap/core'
 *   import Document from '@tiptap/extension-document'
 *   import Text from '@tiptap/extension-text'
 *   import { ComarkKit } from 'tiptap-comark'
 *
 *   const editor = new Editor({
 *     extensions: [Document, Text, ...ComarkKit],
 *   })
 *
 * `ComarkKit` is an array, not a single extension, because Tiptap's Editor
 * accepts arrays at the top level — it composes naturally with whatever
 * else you want to add (custom components via `defineComarkComponent`,
 * collaboration extensions, etc.).
 *
 * A separate `comarkSpecs` export gives the same thing in raw `NodeSpec` /
 * `MarkSpec` form for use with `createSerializer` in tests or other
 * ProseMirror-based tooling that doesn't go through Tiptap.
 */

import type { Extensions } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Text from '@tiptap/extension-text'
import { ComarkBold, boldSpec } from './marks/bold'
import { ComarkCode, codeSpec } from './marks/code'
import { ComarkItalic, italicSpec } from './marks/italic'
import { ComarkLink, linkSpec } from './marks/link'
import { ComarkStrike, strikeSpec } from './marks/strike'
import { ComarkBlockquote, blockquoteSpec } from './nodes/blockquote'
import { ComarkCodeBlock, codeBlockSpec } from './nodes/code-block'
import { ComarkComment, commentSpec } from './nodes/comment'
import { ComarkHardBreak, hardBreakSpec } from './nodes/hard-break'
import { ComarkHeading, headingSpec } from './nodes/heading'
import { ComarkHorizontalRule, horizontalRuleSpec } from './nodes/horizontal-rule'
import { ComarkImage, imageSpec } from './nodes/image'
import {
  ComarkBulletList,
  ComarkListItem,
  ComarkOrderedList,
  bulletListSpec,
  listItemSpec,
  orderedListSpec,
} from './nodes/lists'
import { ComarkParagraph, paragraphSpec } from './nodes/paragraph'
import {
  ComarkTable,
  ComarkTableCell,
  ComarkTableHeader,
  ComarkTableRow,
  tableCellSpec,
  tableHeaderSpec,
  tableRowSpec,
  tableSpec,
} from './nodes/table'
import { ComarkTemplate, templateSpec } from './nodes/template'
import { ComarkSerializer } from './serializer'
import type { MarkSpec, NodeSpec } from './types'

export const ComarkKit: Extensions = [
  // Core orchestrator first so its storage is initialised before any
  // extension's onCreate fires (not strictly necessary, but predictable).
  ComarkSerializer,

  // PM schema essentials — every editor needs the doc and text node specs.
  // We pull them straight from Tiptap rather than reinvent: they're tiny,
  // stable, and have no Comark-specific behavior.
  Document,
  Text,

  // Block nodes
  ComarkParagraph,
  ComarkHeading,
  ComarkBlockquote,
  ComarkBulletList,
  ComarkOrderedList,
  ComarkListItem,
  ComarkCodeBlock,
  ComarkHorizontalRule,
  ComarkImage,
  ComarkTable,
  ComarkTableRow,
  ComarkTableHeader,
  ComarkTableCell,
  ComarkTemplate,
  ComarkComment,

  // Inline atoms
  ComarkHardBreak,

  // Marks
  ComarkBold,
  ComarkItalic,
  ComarkStrike,
  ComarkCode,
  ComarkLink,
]

export const comarkSpecs: { nodes: NodeSpec[]; marks: MarkSpec[] } = {
  nodes: [
    paragraphSpec,
    headingSpec,
    blockquoteSpec,
    bulletListSpec,
    orderedListSpec,
    listItemSpec,
    codeBlockSpec,
    horizontalRuleSpec,
    imageSpec,
    tableSpec,
    tableRowSpec,
    tableHeaderSpec,
    tableCellSpec,
    templateSpec,
    commentSpec,
    hardBreakSpec,
  ],
  marks: [boldSpec, italicSpec, strikeSpec, codeSpec, linkSpec],
}
