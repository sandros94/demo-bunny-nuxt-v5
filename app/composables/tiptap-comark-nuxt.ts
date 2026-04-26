/**
 * tiptap-comark-nuxt
 * ----------------------------------------------------------------------------
 * Nuxt UI-flavored Comark <-> UEditor integration, built on the framework-
 * agnostic converters in `./tiptap-comark`.
 *
 * What it gives you:
 *
 *   const { model, extensions, handlers } = useComarkEditor(tree, { registry })
 *
 *   <UEditor v-model="model" content-type="json"
 *            :extensions="extensions" :handlers="handlers" />
 *
 * Where `tree` is a `Ref<ComarkTree>` — your source of truth — and `model`
 * is an internal PM-JSON ref that UEditor writes into. Changes are converted
 * bidirectionally and loop-guarded.
 *
 * Custom Comark components (`::alert`, `::card`, inline `:badge[...]`) are
 * declared via a registry. Each entry becomes:
 *   - a Tiptap Node extension (auto-generated)
 *   - a Comark<->PM round-trip handler pair
 *   - a UEditor custom handler `insert_<name>` you can reference from toolbar
 *     or slash-menu items via `{ kind: 'insert_alert', ... }`
 *
 * Schema validation uses Standard Schema v1 (Zod, Valibot, Arktype...) so
 * props are validated on both conversion paths.
 *
 * Component rendering inside the editor is left to a user-provided `nodeView`
 * Vue SFC per definition — this is where the prop form lives. A future
 * `nuxt-component-meta` bridge can auto-derive a form from component props
 * (see the `meta` field + the `getDefaultProps` helper for the extension point).
 * ----------------------------------------------------------------------------
 */

import { shallowRef, watch, type Component, type Ref } from 'vue'
import { Extension, Node, mergeAttributes, type Extensions } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { Editor } from '@tiptap/vue-3'
import { Table } from '@tiptap/extension-table/table'
import { TableRow } from '@tiptap/extension-table/row'
import { TableHeader } from '@tiptap/extension-table/header'
import { TableCell } from '@tiptap/extension-table/cell'
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { StandardSchemaV1 } from '@standard-schema/spec'

import {
  comarkToProseMirror,
  proseMirrorToComark,
  type ComarkTree,
  type ComarkNode,
  type ComarkElement,
  type ComarkElementAttributes,
  type PMNode,
  type ConvertOptions,
} from '~/utils/tiptap-comark'

// ===========================================================================
// Component registry
// ===========================================================================

/**
 * Placeholder for the shape we'd derive from `nuxt-component-meta` /
 * `vue-component-meta`. Kept minimal until that's wired up. When `meta` is
 * present on a definition, it supersedes `schema` for default-value lookup
 * and (eventually) for auto-form generation in the NodeView.
 */
export interface ComarkComponentMeta {
  props: Array<{
    name: string
    type: string
    required?: boolean
    default?: unknown
    description?: string
  }>
}

export interface ComarkComponentDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Comark tag name — `alert`, `card`, `badge`, etc. */
  name: string

  /**
   * `block` components (`::alert`) have editable slot children.
   * `inline` components (`:badge[...]`) are atoms in the PM schema.
   * Defaults to `block`.
   */
  kind?: 'block' | 'inline'

  /** Standard Schema validator for props (Zod / Valibot / Arktype / ...). */
  schema?: StandardSchemaV1<TProps>

  /**
   * Vue component rendered as the in-editor NodeView. This is where you
   * render the form that edits the component's props + (for block components)
   * the slot for children via `<NodeViewContent />`.
   *
   * If omitted, Tiptap falls back to the default rendering from `renderHTML`.
   */
  nodeView?: Component

  /**
   * Optional introspection metadata. Future bridge to `nuxt-component-meta`
   * will populate this automatically; for now you can hand-author it.
   */
  meta?: ComarkComponentMeta

  /**
   * Escape hatch: override the generated Tiptap extension before it's
   * returned. Receives the default config object; return the modified one.
   */
  extendTiptap?: (config: Parameters<typeof Node.create>[0]) => Parameters<typeof Node.create>[0]
}

export interface ComarkComponentRegistry {
  add<T extends Record<string, unknown>>(def: ComarkComponentDefinition<T>): void
  get(name: string): ComarkComponentDefinition | undefined
  all(): ComarkComponentDefinition[]
}

export function createComarkComponentRegistry(
  initial: ComarkComponentDefinition[] = [],
): ComarkComponentRegistry {
  const map = new Map<string, ComarkComponentDefinition>()
  for (const d of initial) map.set(d.name, d as ComarkComponentDefinition)
  return {
    add(def) {
      map.set(def.name, def as ComarkComponentDefinition)
    },
    get(name) {
      return map.get(name)
    },
    all() {
      return Array.from(map.values())
    },
  }
}

// ===========================================================================
// Schema validation (Standard Schema v1)
// ===========================================================================

type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false
      issues: readonly {
        message: string
        path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>
      }[]
    }

function validateProps(
  def: ComarkComponentDefinition,
  props: Record<string, unknown>,
): ValidationResult {
  if (!def.schema) return { ok: true, value: props }

  const result = def.schema['~standard'].validate(props)
  if (result instanceof Promise) {
    // We only support sync validation in the editor loop. Async validators
    // need to be wrapped in a sync-compatible adapter or the definition needs
    // `schema` omitted in favor of server-side validation.
    if (typeof console !== 'undefined') {
      console.warn(
        `[comark] Async schema on "${def.name}" is unsupported in the editor pipeline — skipping.`,
      )
    }
    return { ok: true, value: props }
  }

  if (result.issues) return { ok: false, issues: result.issues }
  return { ok: true, value: (result.value ?? {}) as Record<string, unknown> }
}

// ===========================================================================
// Comark attribute split — props vs HTML extras
// ===========================================================================
// A Comark component invocation can carry two flavors of attribute:
//
//   ::alert{type="info" .my-class #my-id data-foo="bar"}
//
//   - `type`     — typed user prop, validated by the component's schema
//   - `class`    — HTML extra (presentation), preserved as-is
//   - `id`       — HTML extra
//   - `data-foo` — HTML extra
//
// The split is required for the upstream round-trip to be non-destructive:
// strict schemas (`zod.strict()`, `valibot.strictObject(...)`) would reject
// the HTML extras as unknown keys and the data would be silently dropped.
// We mirror Comark's own convention here — anything matching the HTML attr
// name space (`class`, `id`, `style`, `data-*`, `aria-*`) is treated as an
// extra; everything else is a prop.
//
// Boolean/number/object props are `:`-prefixed in the AST (Comark uses this
// to mean "decode as JSON-ish, not as a string") — we strip the prefix on
// the way in and re-add it on the way out.

const HTML_EXTRA_KEYS = new Set(['class', 'id', 'style'])

function isHtmlExtraKey(k: string): boolean {
  return HTML_EXTRA_KEYS.has(k) || k.startsWith('data-') || k.startsWith('aria-')
}

function splitComarkAttrs(attrs: ComarkElementAttributes | undefined): {
  props: Record<string, unknown>
  extras: Record<string, unknown>
} {
  const props: Record<string, unknown> = {}
  const extras: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (k === '$') continue
    if (v === null || v === undefined) continue
    if (k.startsWith(':')) {
      const bare = k.slice(1)
      if (isHtmlExtraKey(bare)) extras[bare] = coerceScalar(v)
      else props[bare] = coerceScalar(v)
    } else if (isHtmlExtraKey(k)) {
      extras[k] = v
    } else {
      props[k] = v
    }
  }
  return { props, extras }
}

function encodeComarkProps(props: Record<string, unknown>): ComarkElementAttributes {
  const out: ComarkElementAttributes = {}
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'boolean' || typeof v === 'number') {
      out[`:${k}`] = String(v)
    } else if (typeof v === 'object') {
      out[`:${k}`] = JSON.stringify(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function coerceScalar(v: unknown): unknown {
  if (typeof v !== 'string') return v
  if (v === 'true') return true
  if (v === 'false') return false
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v)
  // Try JSON for object/array props
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      return JSON.parse(v)
    } catch {
      /* fall through */
    }
  }
  return v
}

// ===========================================================================
// `ComarkAttrs` — opts every standard Tiptap node into the `comarkExtras`
// carrier so HTML-style attrs from Comark survive the live editor's PM
// schema validation.
//
// Without this, `commands.setContent(jsonDoc)` silently drops any attr the
// schema doesn't know about — meaning a heading parsed from
// `# Hi {.sticky}` would lose `class="sticky"` the moment it entered the
// editor, even though the converter emits it correctly.
//
// Marks (bold/em/strike/code/link) need separate per-mark extension because
// Tiptap's `addGlobalAttributes` only applies to nodes. The framework-
// agnostic file always emits `mark.attrs.comarkExtras`; users editing in
// Tiptap should re-export the marks they care about with `comarkExtras`
// added to `addAttributes()`.
// ===========================================================================

const COMARK_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'comarkTemplate',
] as const

export const ComarkAttrs = Extension.create({
  name: 'comarkAttrs',

  addGlobalAttributes() {
    return [
      {
        types: [...COMARK_NODE_TYPES],
        attributes: {
          comarkExtras: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const raw = el.getAttribute('data-comark-extras')
              if (!raw) return null
              try {
                return JSON.parse(raw)
              } catch {
                return null
              }
            },
            renderHTML: (attrs: { comarkExtras?: Record<string, unknown> | null }) => {
              const e = attrs.comarkExtras
              return e && Object.keys(e).length > 0
                ? { 'data-comark-extras': JSON.stringify(e) }
                : {}
            },
            keepOnSplit: true,
          },
        },
      },
    ]
  },
})

// ===========================================================================
// `ComarkTemplate` — Tiptap node for Comark named-slot templates.
//
// The framework-agnostic converter emits `comarkTemplate` PM nodes for any
// Comark `["template", { name }, …]` element (used by named slots like
// `::card\n#header\n…\n::`). We register a real Tiptap node for it here so
// `commands.setContent(jsonDoc)` doesn't reject content that contains slot
// templates from a registered component.
// ===========================================================================

export const ComarkTemplate = Node.create({
  name: 'comarkTemplate',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-slot'),
        renderHTML: (attrs: { name?: string | null }) =>
          attrs.name ? { 'data-slot': attrs.name } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-comark-template]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-comark-template': '' }), 0]
  },
})

// ===========================================================================
// Tiptap Node extension factory
// ===========================================================================

export function createComarkComponentExtension(def: ComarkComponentDefinition) {
  const isInline = def.kind === 'inline'

  const config: Parameters<typeof Node.create>[0] = {
    name: def.name,
    group: isInline ? 'inline' : 'block',
    inline: isInline,
    // Both block and inline variants hold children — block components have a
    // block slot, inline components hold inline content (text + marks + other
    // inline components).
    atom: false,
    content: isInline ? 'inline*' : 'block+',
    defining: !isInline,
    selectable: true,
    draggable: !isInline,

    addAttributes() {
      return {
        comarkProps: {
          default: {} as Record<string, unknown>,
          // Persist through HTML round-tripping via a data attribute so PM's
          // JSON + copy/paste both preserve the form state.
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-comark-props')
            if (!raw) return {}
            try {
              return JSON.parse(raw)
            } catch {
              return {}
            }
          },
          renderHTML: (attrs: { comarkProps?: Record<string, unknown> }) => ({
            'data-comark-props': JSON.stringify(attrs.comarkProps ?? {}),
          }),
        },
        // HTML attrs from Comark (`class`, `id`, `style`, `data-*`, `aria-*`).
        // Stored separately from `comarkProps` so strict component schemas
        // don't reject them as unknown keys, and so they round-trip without
        // being type-coerced by `encodeComarkProps`.
        comarkExtras: {
          default: null as Record<string, unknown> | null,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-comark-extras')
            if (!raw) return null
            try {
              return JSON.parse(raw)
            } catch {
              return null
            }
          },
          renderHTML: (attrs: { comarkExtras?: Record<string, unknown> | null }) => {
            const e = attrs.comarkExtras
            return e && Object.keys(e).length > 0 ? { 'data-comark-extras': JSON.stringify(e) } : {}
          },
        },
      }
    },

    parseHTML() {
      return [{ tag: `${isInline ? 'span' : 'div'}[data-comark-component="${def.name}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return [
        isInline ? 'span' : 'div',
        mergeAttributes(HTMLAttributes, { 'data-comark-component': def.name }),
        // `0` = content hole for children. Needed for both variants now that
        // inline components are no longer atomic.
        0,
      ]
    },

    addNodeView: def.nodeView ? () => VueNodeViewRenderer(def.nodeView!) : undefined,
  }

  return Node.create(def.extendTiptap ? def.extendTiptap(config) : config)
}

// ===========================================================================
// Registry-aware ConvertOptions
// ===========================================================================

function buildConvertOptions(registry: ComarkComponentRegistry): ConvertOptions {
  const nodeHandlers: NonNullable<ConvertOptions['nodeHandlers']> = {}
  const pmNodeHandlers: NonNullable<ConvertOptions['pmNodeHandlers']> = {}

  for (const def of registry.all()) {
    const isInline = def.kind === 'inline'

    // --- Comark -> PM ---------------------------------------------------
    // The same shape works for both block and inline because part 1's
    // `convertChildren` is context-aware: called from block context it
    // produces block PM nodes, called from inline context it produces
    // inline PM nodes (text + marks + nested inline components).
    nodeHandlers[def.name] = (el, convertChildren) => {
      const [, rawAttrs, ...children] = el
      const { props, extras } = splitComarkAttrs(rawAttrs)
      const validated = validateProps(def, props)
      const value = validated.ok ? validated.value : props
      if (!validated.ok) warnInvalid(def.name, validated.issues, 'parse')

      const content = convertChildren(children as ComarkNode[])

      const attrs: Record<string, unknown> = { comarkProps: value }
      if (Object.keys(extras).length > 0) attrs.comarkExtras = extras

      const pmNode: PMNode = { type: def.name, attrs }

      if (content.length > 0) {
        pmNode.content = content
      } else if (!isInline) {
        // Block components require at least one block child for `block+`.
        // Inline components can legitimately be empty (`inline*`), so leave
        // content undefined and let PM schema handle it.
        pmNode.content = [{ type: 'paragraph' }]
      }

      return pmNode
    }

    // --- PM -> Comark ---------------------------------------------------
    pmNodeHandlers[def.name] = (node, convertChildren) => {
      const props = (node.attrs?.comarkProps as Record<string, unknown>) ?? {}
      const extras = (node.attrs?.comarkExtras as Record<string, unknown>) ?? {}
      const validated = validateProps(def, props)
      if (!validated.ok) warnInvalid(def.name, validated.issues, 'serialize')
      const outAttrs = encodeComarkProps(validated.ok ? validated.value : props)
      // Splat HTML extras back as-is (they are not type-coerced).
      for (const [k, v] of Object.entries(extras)) {
        if (v === null || v === undefined) continue
        outAttrs[k] = v
      }
      const children = convertChildren(node.content ?? [])
      return [def.name, outAttrs, ...children] as ComarkElement
    }
  }

  return { nodeHandlers, pmNodeHandlers }
}

function warnInvalid(
  name: string,
  issues: readonly { message: string }[],
  phase: 'parse' | 'serialize',
) {
  if (typeof console === 'undefined') return
  console.warn(
    `[comark] Invalid props on <${name}> (${phase}):`,
    issues.map((i) => i.message).join('; '),
  )
}

// ===========================================================================
// Composable
// ===========================================================================

export interface UseComarkEditorOptions {
  registry?: ComarkComponentRegistry
  /**
   * Whether to preserve `frontmatter` and `meta` from the source tree when
   * round-tripping through the editor. Defaults to `true`. Disabled if you
   * explicitly want the editor to own the full tree shape.
   */
  preserveMetadata?: boolean
}

export interface UseComarkEditorReturn {
  /** Bind to `<UEditor v-model="model" content-type="json" />`. */
  model: Ref<PMNode>
  /** Pass to `<UEditor :extensions="extensions" />`. */
  extensions: Extensions
  /** Pass to `<UEditor :handlers="handlers" />`. */
  handlers: EditorCustomHandlers
}

export function useComarkEditor(
  source: Ref<ComarkTree>,
  options: UseComarkEditorOptions = {},
): UseComarkEditorReturn {
  const registry = options.registry ?? createComarkComponentRegistry()
  const preserveMetadata = options.preserveMetadata ?? true
  const convertOptions = buildConvertOptions(registry)

  // Stash non-editable tree metadata so we can restore it on serialize.
  let savedFrontmatter = source.value.frontmatter ?? {}
  let savedMeta = source.value.meta ?? {}

  // The PM-JSON ref that UEditor v-models against. `shallowRef` is correct
  // here: UEditor reassigns the whole `modelValue` on every change, so we
  // never need a deep watcher on it. (`deep: true` on a shallowRef is a
  // silent no-op and was misleading in earlier revisions of this file.)
  const model = shallowRef<PMNode>(comarkToProseMirror(source.value, convertOptions))

  // Loop-guard via identity tracking: when one watcher writes to the other
  // side, it stashes the exact reference it just wrote; the receiving
  // watcher checks identity and skips its echo. No `nextTick`, no flags
  // that can drift, no microtask races.
  let pendingFromSource: PMNode | null = null
  let pendingFromModel: ComarkTree | null = null

  // External source -> editor
  watch(
    source,
    (tree) => {
      if (pendingFromModel === tree) {
        pendingFromModel = null
        return
      }
      if (preserveMetadata) {
        savedFrontmatter = tree.frontmatter ?? savedFrontmatter
        savedMeta = tree.meta ?? savedMeta
      }
      const next = comarkToProseMirror(tree, convertOptions)
      pendingFromSource = next
      model.value = next
    },
    { deep: true },
  )

  // Editor -> external source
  watch(model, (pm) => {
    if (!pm) return
    if (pendingFromSource === pm) {
      pendingFromSource = null
      return
    }
    const converted = proseMirrorToComark(pm, convertOptions)
    const next = preserveMetadata
      ? { ...converted, frontmatter: savedFrontmatter, meta: savedMeta }
      : converted
    pendingFromModel = next
    source.value = next
  })

  // The `extensions` and `handlers` are computed once from a snapshot of the
  // registry. If you mutate the registry after `useComarkEditor()` returns,
  // those changes won't be reflected — pass the final registry up front.
  //
  // We bundle:
  //   - `ComarkAttrs`        — adds `comarkExtras` to every standard node
  //   - `ComarkTemplate`     — Tiptap node for `["template", { name }, …]`
  //   - Tiptap's table set   — Comark's parser emits `table`/`tr`/`th`/`td`
  //                            in real-world markdown, so they must be in
  //                            the schema or `setContent()` rejects the doc
  //   - User components from the registry
  const extensions: Extensions = [
    ComarkAttrs,
    ComarkTemplate,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    ...registry.all().map(createComarkComponentExtension),
  ]
  const handlers = buildHandlers(registry)

  return { model, extensions, handlers }
}

// ===========================================================================
// UEditor handlers
// ===========================================================================

function buildHandlers(registry: ComarkComponentRegistry): EditorCustomHandlers {
  const handlers: EditorCustomHandlers = {}

  for (const def of registry.all()) {
    const kind = `insert_${def.name}`
    const defaultProps = getDefaultProps(def)
    const isInline = def.kind === 'inline'

    handlers[kind] = {
      canExecute: (editor: Editor) =>
        editor.can().insertContent({
          type: def.name,
          attrs: { comarkProps: defaultProps },
        }),
      execute: (editor: Editor) =>
        editor
          .chain()
          .focus()
          .insertContent({
            type: def.name,
            attrs: { comarkProps: defaultProps },
            content: isInline ? [{ type: 'text', text: def.name }] : [{ type: 'paragraph' }],
          })
          // `.run()` is what actually dispatches the chain and returns a
          // boolean indicating whether the command succeeded. Without it the
          // chain is built but never executed.
          .run(),
      isActive: (editor: Editor) => editor.isActive(def.name),
      isDisabled: undefined,
    }
  }

  return handlers
}

/**
 * Derive sensible default props for a new component instance. Order of
 * precedence:
 *   1. `meta.props[].default` (from nuxt-component-meta, future)
 *   2. Empty object (schema defaults apply on first parse via validator)
 */
function getDefaultProps(def: ComarkComponentDefinition): Record<string, unknown> {
  if (def.meta?.props) {
    const out: Record<string, unknown> = {}
    for (const p of def.meta.props) {
      if (p.default !== undefined) out[p.name] = p.default
    }
    return out
  }
  return {}
}

// ===========================================================================
// Future: nuxt-component-meta bridge (stub)
// ===========================================================================
//
// When wiring this up later:
//
//   import { useComponentMeta } from '#nuxt-component-meta'
//
//   export function defineComarkComponentFromMeta(
//     name: string,
//     componentName: string,
//     nodeView: Component,
//   ): ComarkComponentDefinition {
//     const meta = useComponentMeta(componentName)
//     return {
//       name,
//       kind: 'block',
//       nodeView,
//       meta: {
//         props: meta.props.map(p => ({
//           name: p.name,
//           type: p.type,
//           required: p.required,
//           default: p.default,
//           description: p.description,
//         })),
//       },
//       // Optional: derive a Standard Schema from meta.props using Valibot/Zod
//       // schema: buildSchemaFromMeta(meta.props),
//     }
//   }
//
// The NodeView component can then `inject` the definition and render a
// <UForm> with fields derived from `meta.props`, using the component's own
// validation schema (if provided) to drive per-field errors in real-time.
//
// ===========================================================================
