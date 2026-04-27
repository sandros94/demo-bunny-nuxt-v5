import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../nodes/paragraph'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { boldSpec } from './bold'

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [boldSpec] })

describe('boldSpec.toComark', () => {
  it('wraps a child in `<strong>`', () => {
    expect(boldSpec.toComark({ type: 'bold' }, 'hi')).toEqual(['strong', {}, 'hi'])
  })

  it('emits htmlAttrs as flat attributes', () => {
    const result = boldSpec.toComark(
      { type: 'bold', attrs: { htmlAttrs: { class: 'hi', id: 'b1' } } },
      'X',
    )
    expect(result).toEqual(['strong', { class: 'hi', id: 'b1' }, 'X'])
  })

  it('canonicalizes <b> tags to <strong> on the way out', () => {
    // The toComark side is unconditional — the spec only emits <strong>.
    expect(boldSpec.toComark({ type: 'bold' }, 'x')[0]).toBe('strong')
  })
})

describe('boldSpec.fromComark', () => {
  it('produces a bare bold mark for an attrless `<strong>`', () => {
    expect(boldSpec.fromComark(['strong', {}, 'x'] as ComarkElement)).toEqual({
      type: 'bold',
    })
  })

  it('routes element attributes onto `mark.attrs.htmlAttrs`', () => {
    const mark = boldSpec.fromComark(['strong', { class: 'k', id: 'b' }, 'x'] as ComarkElement)
    expect(mark).toEqual({
      type: 'bold',
      attrs: { htmlAttrs: { class: 'k', id: 'b' } },
    })
  })

  it('accepts the legacy `<b>` tag', () => {
    // The mark spec claims both `strong` and `b`, so the orchestrator
    // dispatches either form to it. The fromComark just reads attrs —
    // tag name doesn't matter at this layer.
    expect(boldSpec.fromComark(['b', { class: 'a' }, 'x'] as ComarkElement)).toEqual({
      type: 'bold',
      attrs: { htmlAttrs: { class: 'a' } },
    })
  })
})

describe('bold round-trip via helpers', () => {
  it('parses Comark `["strong", {.foo}, "X"]` to PM and back', () => {
    const original: ComarkElement = ['p', {}, ['strong', { class: 'foo' }, 'X']]
    const pm = paragraphSpec.fromComark(original, helpers)
    const back = paragraphSpec.toComark(pm!, helpers)
    expect(back).toEqual(original)
  })

  it('preserves nested marks layered through helpers.parseInlines', () => {
    const original: ComarkElement = ['p', {}, 'a ', ['strong', { class: 'k' }, 'B'], ' c']
    const pm = paragraphSpec.fromComark(original, helpers)
    const back = paragraphSpec.toComark(pm!, helpers)
    expect(back).toEqual(original)
  })
})
