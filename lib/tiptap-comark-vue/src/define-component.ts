/**
 * `defineComarkVueComponent` — Vue-flavored thin wrapper around the
 * framework-agnostic `defineComarkComponent` factory.
 *
 * Identical surface, plus one optional addition: `nodeView` accepts a Vue
 * SFC. We attach it to the underlying Tiptap node via `VueNodeViewRenderer`
 * so the in-editor view renders through Vue's runtime.
 *
 * The framework-agnostic factory in `tiptap-comark` deliberately accepts
 * `nodeView: unknown` and doesn't wire it — it has no Vue dependency.
 * This file is what makes `nodeView: AlertNodeView` actually mount.
 */

import { Node, type Node as TiptapNode } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
  type NodeSpec,
} from 'tiptap-comark'
import type { Component } from 'vue'

export interface ComarkVueComponentDefinition extends Omit<ComarkComponentDefinition, 'nodeView'> {
  /**
   * Optional Vue SFC rendered as the in-editor NodeView. Receives Tiptap's
   * standard NodeView props (`node`, `updateAttributes`, `editor`, …).
   */
  nodeView?: Component
}

/**
 * Same shape as `ComarkComponentExports` but the `extension` has the Vue
 * NodeView wired in (when `nodeView` was provided in the definition).
 */
export type ComarkVueComponentExports = ComarkComponentExports

export function defineComarkVueComponent(
  def: ComarkVueComponentDefinition,
): ComarkVueComponentExports {
  // Build the framework-agnostic part first — it produces the schema and
  // the serialization spec. We then extend the resulting Tiptap Node with
  // `addNodeView` so the Vue SFC takes over rendering.
  const base = defineComarkComponent({ ...def, nodeView: def.nodeView })

  if (!def.nodeView) return base

  const nodeView = def.nodeView
  // `.extend()` widens the storage type generic; the underlying instance
  // still carries the `comark` storage entry produced by the base spec, so
  // narrow back here for the public type.
  const extension = (base.extension as ReturnType<typeof Node.create>).extend({
    addNodeView() {
      return VueNodeViewRenderer(nodeView)
    },
  }) as TiptapNode<unknown, { comark: NodeSpec }>

  return { ...base, extension }
}
