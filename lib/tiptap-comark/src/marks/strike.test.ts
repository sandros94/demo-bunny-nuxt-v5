import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../nodes/paragraph'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { strikeSpec } from './strike'

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [strikeSpec] })

describe('strikeSpec', () => {
  it('round-trips `<del>` with attributes', () => {
    const original: ComarkElement = ['p', {}, ['del', { class: 'cancel' }, 'X']]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('accepts `<s>` on the way in', () => {
    expect(strikeSpec.fromComark(['s', {}, 'x'] as ComarkElement)).toEqual({
      type: 'strike',
    })
  })

  it('always canonicalizes to `<del>` on the way out (matches Comark parser)', () => {
    expect(strikeSpec.toComark({ type: 'strike' }, 'x')[0]).toBe('del')
  })
})
