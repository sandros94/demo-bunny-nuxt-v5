import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../nodes/paragraph'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { italicSpec } from './italic'

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [italicSpec] })

describe('italicSpec', () => {
  it('round-trips an `<em>` with class', () => {
    const original: ComarkElement = ['p', {}, ['em', { class: 'k' }, 'X']]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('accepts the legacy `<i>` tag on the way in', () => {
    const result = italicSpec.fromComark(['i', { class: 'a' }, 'x'] as ComarkElement)
    expect(result).toEqual({ type: 'italic', attrs: { htmlAttrs: { class: 'a' } } })
  })

  it('always canonicalizes to `<em>` on the way out', () => {
    expect(italicSpec.toComark({ type: 'italic' }, 'x')[0]).toBe('em')
  })
})
