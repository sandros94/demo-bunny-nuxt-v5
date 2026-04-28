/**
 * Public API for `tiptap-comark`.
 *
 * Three layers of export, by what consumers most often want:
 *
 *   1. `ComarkKit` — drop-in array of every extension. Most apps just need
 *      this plus `Document`/`Text` from `@tiptap/core`.
 *
 *   2. Individual `Comark*` extensions and their `*Spec` partners — for
 *      apps that want to swap or extend a single node/mark, or use the
 *      specs directly with `createSerializer` (e.g. in tests).
 *
 *   3. The orchestrator (`createSerializer`, `comarkToPmDoc`,
 *      `pmDocToComark`, `ComarkSerializer`) — for advanced use, including
 *      custom commands and headless conversion paths.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
//
// `ComarkComment` is the extension export (matches the `Comark*` naming
// convention the kit uses); the underlying tuple type is re-exported as
// `ComarkCommentTuple` to keep them disjoint. Users who want the tuple
// type by its bare `comark` name can import it directly from `comark`.
export type {
  ComarkComment as ComarkCommentTuple,
  ComarkElement,
  ComarkElementAttributes,
  ComarkHelpers,
  ComarkNode,
  ComarkText,
  ComarkTree,
  JSONContent,
  MarkSpec,
  NodeSpec,
  PMMark,
} from './types'

// ---------------------------------------------------------------------------
// Orchestrator + helpers
// ---------------------------------------------------------------------------
export {
  ComarkSerializer,
  collectHelpers,
  comarkToPmDoc,
  createSerializer,
  pmDocToComark,
  type ComarkSerializerOptions,
  type ComarkSerializerStorage,
  type SerializerSpecs,
} from './serializer'
export { attrsEqual, cleanAttrs, hasNoHtmlAttrs, mergeAttrs, splitAttrs } from './utils/attrs'
export { htmlAttrSpec, type HtmlAttrSpecOptions } from './utils/html-attrs'

// ---------------------------------------------------------------------------
// Operational stylesheet — auto-injected by `ComarkSerializer` unless
// disabled via `ComarkSerializer.configure({ injectStyles: false })`.
// Re-exported here so consumers shipping their own stylesheet pipeline
// (CSP-nonce'd injection, Shadow DOM, build-step bundling) can pull
// the same payload.
// ---------------------------------------------------------------------------
export { COMARK_STYLE_MARKER, comarkStyle, injectComarkStyles } from './style'

// ---------------------------------------------------------------------------
// Kit + per-extension exports
// ---------------------------------------------------------------------------
export { ComarkKit, comarkSpecs } from './kit'

// nodes
export { ComarkBlockquote, blockquoteSpec } from './nodes/blockquote'
export { ComarkCodeBlock, codeBlockSpec } from './nodes/code-block'
export { ComarkComment, commentSpec } from './nodes/comment'
export { ComarkHardBreak, hardBreakSpec } from './nodes/hard-break'
export { ComarkHeading, headingSpec } from './nodes/heading'
export { ComarkHorizontalRule, horizontalRuleSpec } from './nodes/horizontal-rule'
export { ComarkImage, imageSpec } from './nodes/image'
export {
  ComarkBulletList,
  ComarkListItem,
  ComarkOrderedList,
  bulletListSpec,
  listItemSpec,
  orderedListSpec,
} from './nodes/lists'
export { ComarkParagraph, paragraphSpec } from './nodes/paragraph'
export {
  ComarkTable,
  ComarkTableCell,
  ComarkTableHeader,
  ComarkTableRow,
  tableCellSpec,
  tableHeaderSpec,
  tableRowSpec,
  tableSpec,
} from './nodes/table'
export { ComarkTemplate, templateSpec } from './nodes/template'

// marks
export { ComarkBold, boldSpec } from './marks/bold'
export { ComarkCode, codeSpec } from './marks/code'
export { ComarkItalic, italicSpec } from './marks/italic'
export { ComarkLink, linkSpec } from './marks/link'
export { ComarkStrike, strikeSpec } from './marks/strike'

// extensions
export {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
  type ComarkComponentProp,
} from './extensions/component'
