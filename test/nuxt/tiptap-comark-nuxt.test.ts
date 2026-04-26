/**
 * Unit tests for the Nuxt-side composable. These exercise the pure-function
 * surface — props/extras split and source/model loop guard — without booting
 * a Tiptap editor instance.
 *
 * Lives under `test/nuxt/` rather than `test/unit/` because the file imports
 * via the `~/` alias (resolved by Nuxt's test environment).
 */
import { describe, expect, it } from 'vitest'
import { nextTick, ref, watch, type Ref } from 'vue'

import { createComarkComponentRegistry, useComarkEditor } from '~/composables/tiptap-comark-nuxt'
import type { ComarkTree, PMNode } from '~/utils/tiptap-comark'

// Helpers: `ComarkNode` is recursive enough that Vue's `Ref<V, S>` literal
// inference rejects most direct `ref<ComarkTree>(literal)` patterns. The
// `comarkRef` cast moves the variance break into one place.
function seed(nodes: ComarkTree['nodes']): ComarkTree {
  return { nodes, frontmatter: {}, meta: {} }
}
const comarkRef = (tree: ComarkTree): Ref<ComarkTree> => ref(tree) as unknown as Ref<ComarkTree>

describe('useComarkEditor — source ↔ model sync', () => {
  it('produces a PM doc on init', () => {
    const source = comarkRef(seed([['h1', {}, 'Hi']]))
    const { model } = useComarkEditor(source)
    expect(model.value).toMatchObject({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Hi' }],
        },
      ],
    })
  })

  it('updates the model when source changes', async () => {
    const source = comarkRef(seed([['p', {}, 'one']]))
    const { model } = useComarkEditor(source)
    source.value = seed([['p', {}, 'two']])
    await nextTick()
    expect(JSON.stringify(model.value)).toContain('"two"')
  })

  it('updates the source when model changes', async () => {
    const source = comarkRef(seed([['p', {}, 'one']]))
    const { model } = useComarkEditor(source)
    model.value = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }],
    }
    await nextTick()
    expect(JSON.stringify(source.value.nodes)).toContain('"edited"')
  })

  it('does not ping-pong: a single source write fires the model watcher exactly once', async () => {
    const source = comarkRef(seed([['p', {}, 'one']]))
    const { model } = useComarkEditor(source)
    // Discard the initial model assignment by waiting one tick before
    // attaching the spy.
    await nextTick()

    let modelTicks = 0
    const stopWatch = watch(model, () => modelTicks++, { flush: 'sync' })

    source.value = seed([['p', {}, 'two']])
    await nextTick()
    await nextTick()

    expect(modelTicks).toBe(1)
    stopWatch()
  })

  it('preserves frontmatter and meta across an editor-driven edit', async () => {
    const source = comarkRef({
      nodes: [['p', {}, 'one']],
      frontmatter: { title: 'T' },
      meta: { custom: 'x' },
    })
    const { model } = useComarkEditor(source)
    model.value = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }],
    }
    await nextTick()
    expect(source.value.frontmatter).toEqual({ title: 'T' })
    expect(source.value.meta).toEqual({ custom: 'x' })
  })
})

describe('useComarkEditor — component props vs HTML extras', () => {
  it('splits typed props from HTML extras (class/id/data-*) on the way in', () => {
    const registry = createComarkComponentRegistry([{ name: 'alert', kind: 'block' }])
    const source = comarkRef({
      nodes: [
        [
          'alert',
          { 'type': 'info', 'class': 'ring', 'id': 'a1', 'data-foo': 'bar' },
          ['p', {}, 'Hi'],
        ],
      ],
      frontmatter: {},
      meta: {},
    })
    const { model } = useComarkEditor(source, { registry })
    const alert = model.value.content?.[0]
    expect(alert?.type).toBe('alert')
    expect(alert?.attrs?.comarkProps).toEqual({ type: 'info' })
    expect(alert?.attrs?.comarkExtras).toEqual({
      'class': 'ring',
      'id': 'a1',
      'data-foo': 'bar',
    })
  })

  it('round-trips extras back into Comark attrs', async () => {
    const registry = createComarkComponentRegistry([{ name: 'alert', kind: 'block' }])
    const source = comarkRef({
      nodes: [['alert', { type: 'info', class: 'ring' }, ['p', {}, 'Hi']]],
      frontmatter: {},
      meta: {},
    })
    const { model } = useComarkEditor(source, { registry })

    // Force an editor-driven update by reassigning the model from a deep clone.
    model.value = JSON.parse(JSON.stringify(model.value)) as PMNode
    await nextTick()

    const node = source.value.nodes[0] as [string, Record<string, unknown>, ...unknown[]]
    expect(node[0]).toBe('alert')
    // The HTML `class` should ride alongside the typed `type` prop.
    expect(node[1]).toMatchObject({ type: 'info', class: 'ring' })
  })

  it('strips Comark internal `$` metadata from component props', () => {
    const registry = createComarkComponentRegistry([{ name: 'alert', kind: 'block' }])
    const source = comarkRef({
      nodes: [['alert', { type: 'info', $: { line: 1, html: 0, block: 1 } }, ['p', {}, 'Hi']]],
      frontmatter: {},
      meta: {},
    })
    const { model } = useComarkEditor(source, { registry })
    const serialized = JSON.stringify(model.value)
    expect(serialized).not.toContain('"$"')
    expect(serialized).toContain('"type":"info"')
  })
})
