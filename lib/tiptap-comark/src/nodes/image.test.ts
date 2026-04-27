import { describe, expect, it } from 'vitest'
import { createSerializer } from '../serializer'
import { paragraphSpec } from './paragraph'
import type { ComarkElement } from '../types'
import { imageSpec } from './image'

const helpers = createSerializer({
  nodes: [paragraphSpec, imageSpec],
  marks: [],
})

describe('imageSpec', () => {
  it('round-trips a basic image', () => {
    const original: ComarkElement = ['img', { src: '/x.png', alt: 'alt', title: 'title' }]
    const pm = imageSpec.fromComark(original, helpers)!
    expect(pm).toEqual({
      type: 'image',
      attrs: { src: '/x.png', alt: 'alt', title: 'title' },
    })
    expect(imageSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('preserves width/height/class on htmlAttrs', () => {
    const original: ComarkElement = [
      'img',
      { src: '/x.png', alt: 'alt', width: '800', height: '600', class: 'lead' },
    ]
    const pm = imageSpec.fromComark(original, helpers)!
    expect(pm.attrs).toEqual({
      src: '/x.png',
      alt: 'alt',
      title: null,
      htmlAttrs: { width: '800', height: '600', class: 'lead' },
    })
    expect(imageSpec.toComark(pm, helpers)).toEqual(original)
  })

  it('round-trips an inline image inside a paragraph', () => {
    const original: ComarkElement = [
      'p',
      {},
      'see ',
      ['img', { src: '/icon.png', alt: 'i' }],
      ' here',
    ]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })
})
