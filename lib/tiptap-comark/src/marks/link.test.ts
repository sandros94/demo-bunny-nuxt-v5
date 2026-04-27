import { describe, expect, it } from 'vitest'
import { paragraphSpec } from '../nodes/paragraph'
import { createSerializer } from '../serializer'
import type { ComarkElement } from '../types'
import { linkSpec } from './link'

const helpers = createSerializer({ nodes: [paragraphSpec], marks: [linkSpec] })

describe('linkSpec.toComark', () => {
  it('emits an `<a>` with semantic attrs flat', () => {
    expect(linkSpec.toComark({ type: 'link', attrs: { href: '/x', title: 'T' } }, 'go')).toEqual([
      'a',
      { href: '/x', title: 'T' },
      'go',
    ])
  })

  it('omits `title` when nullish', () => {
    expect(linkSpec.toComark({ type: 'link', attrs: { href: '/x' } }, 'go')).toEqual([
      'a',
      { href: '/x' },
      'go',
    ])
  })

  it('splats htmlAttrs alongside semantic attrs', () => {
    expect(
      linkSpec.toComark(
        {
          type: 'link',
          attrs: {
            href: '/x',
            htmlAttrs: { target: '_blank', rel: 'noopener', class: 'btn' },
          },
        },
        'go',
      ),
    ).toEqual(['a', { href: '/x', target: '_blank', rel: 'noopener', class: 'btn' }, 'go'])
  })
})

describe('linkSpec.fromComark', () => {
  it('routes href/title onto semantic attrs and the rest onto htmlAttrs', () => {
    const result = linkSpec.fromComark([
      'a',
      {
        href: '/x',
        title: 'T',
        target: '_blank',
        rel: 'noopener',
        class: 'btn',
      },
    ] as ComarkElement)
    expect(result).toEqual({
      type: 'link',
      attrs: {
        href: '/x',
        title: 'T',
        htmlAttrs: { target: '_blank', rel: 'noopener', class: 'btn' },
      },
    })
  })

  it('sets `title: null` when missing (matches Tiptap link convention)', () => {
    const result = linkSpec.fromComark(['a', { href: '/x' }] as ComarkElement)
    expect(result?.attrs?.title).toBe(null)
  })
})

describe('link round-trip', () => {
  it('preserves every attribute on a fully-loaded link', () => {
    const original: ComarkElement = [
      'p',
      {},
      [
        'a',
        {
          'href': 'https://example.com',
          'title': 'home',
          'target': '_blank',
          'rel': 'noopener external',
          'class': 'cta',
          'id': 'go',
          'data-track': 'home-cta',
        },
        'go',
      ],
    ]
    const pm = paragraphSpec.fromComark(original, helpers)!
    expect(paragraphSpec.toComark(pm, helpers)).toEqual(original)
  })
})
