import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../nodes/paragraph'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { codeSpec } from './code'

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [codeSpec] })

describe('codeSpec', () => {
  it('round-trips inline code with a language class', () => {
    const original: ComarkElement = ['p', {}, ['code', { class: 'language-ts' }, 'x']]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('produces a bare code mark when there are no attrs', () => {
    expect(codeSpec.fromComark(['code', {}, 'x'] as ComarkElement)).toEqual({
      type: 'code',
    })
  })
})
