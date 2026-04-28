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

import { VueNodeViewRenderer } from '@tiptap/vue-3'
import {
  defineComarkComponent,
  type ComarkComponentDefinition,
  type ComarkComponentExports,
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
  // `.extend()` only adds an `addNodeView` config; the storage type from
  // `base.extension` (which already carries `{ comark: NodeSpec }`) is
  // preserved through the call, so no cast is needed.
  const extension = base.extension.extend({
    addNodeView() {
      return VueNodeViewRenderer(nodeView)
    },
  })

  return { ...base, extension }
}
