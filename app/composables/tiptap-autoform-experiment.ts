/**
 * tiptap-comark-nuxt-autoform.experimental
 * ----------------------------------------------------------------------------
 * EXPERIMENTAL. Generates Tiptap NodeViews automatically from a component's
 * meta (prop names, types, defaults) so you don't have to hand-write a .vue
 * file per Comark component. Uses UForm's custom `validate` prop instead of
 * a Standard Schema, so validation logic can be arbitrary JS.
 *
 * This is a best-effort sketch. It depends on several assumptions that
 * should be verified against the installed Nuxt UI version:
 *
 *   1. Nuxt UI components are globally registered (so `resolveComponent` can
 *      find `UForm`, `UFormField`, `UButton`, `UInput`, etc.). True in a
 *      Nuxt project with `@nuxt/ui` installed; may not be in a plain Vite/Vue
 *      setup, in which case components must be passed in explicitly.
 *
 *   2. UForm accepts a `validate` prop with the signature
 *      `(state) => FormError[] | Promise<FormError[]>` where FormError is
 *      `{ name: string, message: string }`. This is how it worked at the
 *      time of writing; double-check for your version.
 *
 *   3. The `ComarkComponentMeta` shape matches what a future
 *      `nuxt-component-meta` bridge would emit. For now it's hand-authored,
 *      see the usage sketch at the bottom of the file.
 *
 * Nothing in `tiptap-comark-nuxt.ts` imports this file — if the experiment
 * doesn't pan out, deleting this file is safe and sufficient.
 * ----------------------------------------------------------------------------
 */

import { defineComponent, h, reactive, watch, resolveComponent, type PropType } from 'vue'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/vue-3'
import type { ComarkComponentDefinition, ComarkComponentMeta } from './tiptap-comark-nuxt'

// ---------------------------------------------------------------------------
// UForm types (match against installed @nuxt/ui if this drifts)
// ---------------------------------------------------------------------------

export interface FormError {
  name: string
  message: string
}

export type CustomValidate = (state: Record<string, unknown>) => FormError[] | Promise<FormError[]>

// ---------------------------------------------------------------------------
// Field renderer abstraction
// ---------------------------------------------------------------------------

type MetaProp = ComarkComponentMeta['props'][number]

export interface FieldRenderer {
  /** Return a VNode for the input control bound to `state[prop.name]`. */
  render: (prop: MetaProp, state: Record<string, unknown>) => ReturnType<typeof h>
}

export interface AutoFormOptions {
  /** `block` (editable slot) or `inline` (inline content). Default: `block`. */
  kind?: 'block' | 'inline'
  /**
   * Custom sync or async validation using UForm's `validate` prop API.
   * Return an array of `FormError` (empty = valid). This is independent
   * of any Standard Schema — use it when the rules don't map cleanly.
   */
  validate?: CustomValidate
  /**
   * Override or extend the default field renderers, keyed by the `type`
   * string from `ComponentMeta`. Useful for mapping custom prop types
   * (e.g. `"HexColor"` → a color picker).
   */
  fieldRenderers?: Record<string, FieldRenderer>
  /** Extra CSS classes applied to the NodeViewWrapper root. */
  class?: string
}

// ---------------------------------------------------------------------------
// Default renderers for the primitive types nuxt-component-meta emits
// ---------------------------------------------------------------------------

const DEFAULT_RENDERERS: Record<string, FieldRenderer> = {
  string: {
    render: (prop, state) =>
      h(resolveComponent('UInput'), {
        'modelValue': state[prop.name] ?? '',
        'onUpdate:modelValue': (v: unknown) => {
          state[prop.name] = v
        },
        'placeholder': prop.default != null ? prop.default : undefined,
        'class': 'w-full',
      }),
  },
  number: {
    render: (prop, state) =>
      h(resolveComponent('UInputNumber'), {
        'modelValue': state[prop.name] ?? prop.default ?? 0,
        'onUpdate:modelValue': (v: unknown) => {
          state[prop.name] = v
        },
        'class': 'w-full',
      }),
  },
  boolean: {
    render: (prop, state) =>
      h(resolveComponent('USwitch'), {
        'modelValue': Boolean(state[prop.name] ?? prop.default),
        'onUpdate:modelValue': (v: unknown) => {
          state[prop.name] = v
        },
      }),
  },
}

// ---------------------------------------------------------------------------
// Enum detection — matches TS union types like `"info" | "warning"` | `"error"`
// ---------------------------------------------------------------------------

function detectEnum(type: string): string[] | null {
  const parts = type
    .split('|')
    .map((s) => s.trim())
    .map((s) => s.match(/^["'](.*)["']$/)?.[1])
    .filter((s): s is string => s != null)

  return parts.length > 1 ? parts : null
}

function enumRenderer(items: string[]): FieldRenderer {
  return {
    render: (prop, state) =>
      h(resolveComponent('USelectMenu'), {
        'modelValue': state[prop.name] ?? prop.default ?? items[0],
        'onUpdate:modelValue': (v: unknown) => {
          state[prop.name] = v
        },
        items,
        'class': 'w-full',
      }),
  }
}

// ---------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------

export function defineAutoFormComponent(
  name: string,
  meta: ComarkComponentMeta,
  options: AutoFormOptions = {},
): ComarkComponentDefinition {
  const isInline = options.kind === 'inline'
  const renderers = { ...DEFAULT_RENDERERS, ...options.fieldRenderers }

  const NodeView = defineComponent({
    name: `ComarkAutoForm_${name}`,
    props: {
      node: {
        type: Object as PropType<NodeViewProps['node']>,
        required: true,
      },
      updateAttributes: {
        type: Function as PropType<NodeViewProps['updateAttributes']>,
        required: true,
      },
      selected: { type: Boolean, default: false },
      editor: {
        type: Object as PropType<NodeViewProps['editor']>,
        required: true,
      },
    },
    setup(props) {
      const state = reactive<Record<string, unknown>>({})

      function syncFromNode() {
        const current = (props.node.attrs.comarkProps ?? {}) as Record<string, unknown>
        for (const p of meta.props) {
          const val = current[p.name] ?? p.default ?? undefined
          if (state[p.name] !== val) state[p.name] = val
        }
      }
      syncFromNode()

      watch(() => props.node.attrs.comarkProps, syncFromNode, { deep: true })

      function onSubmit() {
        // Drop empty/nullish values so the serialized Comark AST stays tidy
        const clean: Record<string, unknown> = {}
        for (const p of meta.props) {
          const v = state[p.name]
          if (v !== undefined && v !== null && v !== '') clean[p.name] = v
        }
        props.updateAttributes({ comarkProps: clean })
      }

      function renderField(prop: MetaProp) {
        // Enum detection takes priority over the type map
        const enumValues = detectEnum(prop.type)
        const renderer = enumValues
          ? enumRenderer(enumValues)
          : (renderers[prop.type] ?? renderers.string)

        return h(
          resolveComponent('UFormField'),
          {
            key: prop.name,
            name: prop.name,
            label: prop.name + (prop.required ? ' *' : ''),
            description: prop.description,
          },
          () => renderer?.render(prop, state),
        )
      }

      return () =>
        h(
          NodeViewWrapper,
          {
            'as': isInline ? 'span' : 'div',
            'class': [
              'comark-autoform group relative',
              isInline
                ? 'inline-flex items-baseline gap-1 rounded-md border border-dashed border-accented px-1.5 py-0.5'
                : 'my-4 rounded-lg border border-dashed border-accented p-4',
              props.selected ? 'ring-2 ring-primary/40' : '',
              options.class,
            ],
            'data-comark-component': name,
          },
          {
            default: () => [
              h(
                'div',
                {
                  class: isInline
                    ? 'inline-flex items-center gap-1'
                    : 'flex items-center justify-between mb-2',
                  contenteditable: 'false',
                },
                [
                  h(
                    'span',
                    { class: 'text-xs font-mono text-muted' },
                    isInline ? `:${name}` : `::${name}`,
                  ),
                  h(
                    resolveComponent('UPopover'),
                    { ui: { content: 'p-4 w-80' } },
                    {
                      default: () =>
                        h(resolveComponent('UButton'), {
                          icon: 'i-lucide-settings-2',
                          color: 'neutral',
                          variant: 'ghost',
                          size: 'xs',
                          // Prevent focus stealing that would collapse the selection
                          onMousedown: (e: MouseEvent) => e.preventDefault(),
                        }),
                      content: () =>
                        h(
                          resolveComponent('UForm'),
                          {
                            state,
                            // NOTE: custom validation, not Standard Schema
                            validate: options.validate,
                            class: 'space-y-3',
                            onSubmit,
                          },
                          {
                            default: () => [
                              ...meta.props.map(renderField),
                              h(resolveComponent('UButton'), {
                                type: 'submit',
                                label: 'Apply',
                                size: 'sm',
                                block: true,
                              }),
                            ],
                          },
                        ),
                    },
                  ),
                ],
              ),
              // Editable content hole
              h(NodeViewContent, {
                as: isInline ? 'span' : 'div',
                class: isInline ? '' : 'text-default [&>*]:my-0',
              }),
            ],
          },
        )
    },
  })

  return {
    name,
    kind: options.kind ?? 'block',
    nodeView: NodeView,
    meta,
  }
}

// ---------------------------------------------------------------------------
// Usage sketch (for a .vue <script setup>):
// ---------------------------------------------------------------------------
//
//   import { ref } from 'vue'
//   import type { ComarkTree } from './tiptap-comark'
//   import {
//     createComarkComponentRegistry,
//     useComarkEditor,
//   } from './tiptap-comark-nuxt'
//   import {
//     defineAutoFormComponent,
//     type FormError,
//   } from './tiptap-comark-nuxt-autoform.experimental'
//
//   // Hand-authored for now; eventually this comes from nuxt-component-meta
//   const alertMeta = {
//     props: [
//       {
//         name: 'type',
//         type: '"info" | "warning" | "success" | "error"',
//         required: true,
//         default: 'info',
//         description: 'Visual variant',
//       },
//       {
//         name: 'title',
//         type: 'string',
//         default: '',
//         description: 'Optional header shown above the content',
//       },
//       {
//         name: 'dismissible',
//         type: 'boolean',
//         default: false,
//         description: 'Show a close button',
//       },
//     ],
//   }
//
//   const alertDef = defineAutoFormComponent('alert', alertMeta, {
//     kind: 'block',
//     // Custom validation that Standard Schema can't express cleanly —
//     // cross-field rules, async lookups, etc.
//     validate: (state): FormError[] => {
//       const errors: FormError[] = []
//       if (state.type === 'error' && !state.title) {
//         errors.push({
//           name: 'title',
//           message: 'Error alerts should always have a title.',
//         })
//       }
//       return errors
//     },
//   })
//
//   const tree = ref<ComarkTree>({ nodes: [], frontmatter: {}, meta: {} })
//   const registry = createComarkComponentRegistry([alertDef])
//   const { model, extensions, handlers } = useComarkEditor(tree, { registry })
//
// ---------------------------------------------------------------------------
