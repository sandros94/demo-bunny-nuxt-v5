import { describe, expect, it } from 'vitest'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { hardBreakSpec } from './hard-break'
import { paragraphSpec } from './paragraph'

const helpers = createSerializer({
  nodes: [paragraphSpec, hardBreakSpec],
  marks: [],
})

describe('hardBreakSpec', () => {
  it('round-trips a `<br>` inside a paragraph', () => {
    const original: ComarkElement = ['p', {}, 'a', ['br', {}], 'b']
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(pm.content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'hardBreak' },
      { type: 'text', text: 'b' },
    ])
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })
})
