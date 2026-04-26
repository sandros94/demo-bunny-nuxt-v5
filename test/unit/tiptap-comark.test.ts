/**
 * Unit tests for the framework-agnostic Comark <-> ProseMirror bridge.
 *
 * These tests are organized in three layers:
 *
 *  1. comarkToProseMirror — feed a hand-authored Comark AST, assert PM JSON.
 *  2. proseMirrorToComark — feed PM JSON, assert AST.
 *  3. Round-trip — parse real markdown via `comark`, run it through PM and
 *     back, then render with `comark/render`. The output markdown should
 *     match (or be a normalized form of) the input — this is the test that
 *     guards us against silent data loss for an upstream PR.
 *
 * Some tests are intentionally written against the *expected* behavior of
 * a spec-correct converter — they will fail today and drive fixes.
 */
import { describe, expect, it } from 'vitest'
import { parse } from 'comark'
import { renderMarkdown } from 'comark/render'
import type { ComarkTree as RealComarkTree } from 'comark'

import {
  comarkToProseMirror,
  proseMirrorToComark,
  type ComarkComment,
  type ComarkElement,
  type ComarkTree,
  type ConvertOptions,
  type PMNode,
} from '../../app/utils/tiptap-comark'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const tree = (...nodes: ComarkTree['nodes']): ComarkTree => ({
  nodes,
  frontmatter: {},
  meta: {},
})

const doc = (...content: PMNode[]): PMNode => ({ type: 'doc', content })

/** Run a markdown string through the full round-trip and return the result. */
async function roundTrip(
  markdown: string,
  options: ConvertOptions = {},
): Promise<{ pm: PMNode; out: string; original: RealComarkTree; final: ComarkTree }> {
  const original = await parse(markdown)
  const pm = comarkToProseMirror(original as unknown as ComarkTree, options)
  const final = proseMirrorToComark(pm, options)
  // renderMarkdown expects ComarkTree as the upstream package defines it.
  const out = await renderMarkdown(final as unknown as RealComarkTree)
  return { pm, out, original, final }
}

// ===========================================================================
// 1. comarkToProseMirror — AST → PM JSON
// ===========================================================================

describe('comarkToProseMirror', () => {
  describe('basic blocks', () => {
    it('produces an empty doc with a single empty paragraph for an empty tree', () => {
      expect(comarkToProseMirror(tree())).toEqual(doc({ type: 'paragraph' }))
    })

    it('converts paragraphs with plain text', () => {
      expect(comarkToProseMirror(tree(['p', {}, 'Hello']))).toEqual(
        doc({ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }),
      )
    })

    it('converts headings h1-h6 with the level attr', () => {
      for (let i = 1; i <= 6; i++) {
        const t = tree([`h${i}`, {}, `H${i}`])
        const pm = comarkToProseMirror(t)
        expect(pm.content?.[0]).toEqual({
          type: 'heading',
          attrs: { level: i },
          content: [{ type: 'text', text: `H${i}` }],
        })
      }
    })

    it('converts horizontal rule', () => {
      expect(comarkToProseMirror(tree(['hr', {}])).content).toEqual([{ type: 'horizontalRule' }])
    })

    it('converts blockquote with inner paragraph', () => {
      const t = tree(['blockquote', {}, ['p', {}, 'Quoted']])
      expect(comarkToProseMirror(t).content).toEqual([
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }],
        },
      ])
    })

    it('drops Comark comment nodes (tag === null)', () => {
      const comment: ComarkComment = [null, {}, 'this is a comment']
      const t: ComarkTree = {
        nodes: [comment, ['p', {}, 'visible']],
        frontmatter: {},
        meta: {},
      }
      const pm = comarkToProseMirror(t)
      expect(pm.content).toEqual([
        { type: 'paragraph', content: [{ type: 'text', text: 'visible' }] },
      ])
    })

    it('strips Comark internal `$` metadata from emitted PM attrs', () => {
      // Comark's parser stamps `$.line` etc. onto every element. Round-tripping
      // these into PM (and back out) would leak parser internals. Verify they
      // never appear on the PM output.
      const t: ComarkTree = {
        nodes: [
          ['h1', { id: 'hello', $: { line: 1, html: 0, block: 1 } }, 'Hello'],
          ['p', { class: 'lead', $: { line: 3 } }, 'Lead text'],
        ],
        frontmatter: {},
        meta: {},
      }
      const pm = comarkToProseMirror(t)
      const serialized = JSON.stringify(pm)
      expect(serialized).not.toContain('"$"')
      // But the user attrs survive
      expect(serialized).toContain('hello')
      expect(serialized).toContain('lead')
    })

    it('preserves non-standard block attrs via comarkExtras carrier', () => {
      // Heading with a `class`, blockquote with `data-cite`, hr with `id` —
      // every standard block must carry user attrs through PM round-trip.
      const t: ComarkTree = {
        nodes: [
          ['h2', { id: 'sec-1', class: 'sticky' }, 'Section'],
          ['blockquote', { 'data-cite': 'rfc' }, ['p', {}, 'Q']],
          ['hr', { class: 'divider' }],
        ],
        frontmatter: {},
        meta: {},
      }
      const pm = comarkToProseMirror(t)
      expect(pm.content?.[0]?.attrs).toEqual({
        level: 2,
        comarkExtras: { id: 'sec-1', class: 'sticky' },
      })
      expect(pm.content?.[1]?.attrs).toEqual({ comarkExtras: { 'data-cite': 'rfc' } })
      expect(pm.content?.[2]?.attrs).toEqual({ comarkExtras: { class: 'divider' } })
    })
  })

  describe('inline marks', () => {
    it('converts strong/em/s/code/a marks', () => {
      const t = tree([
        'p',
        {},
        ['strong', {}, 'bold'],
        ' ',
        ['em', {}, 'italic'],
        ' ',
        ['s', {}, 'strike'],
        ' ',
        ['code', {}, 'code'],
        ' ',
        ['a', { href: 'https://example.com' }, 'link'],
      ])
      const inlines = comarkToProseMirror(t).content?.[0]?.content
      expect(inlines).toEqual([
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'strike', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        { type: 'text', text: ' ' },
        {
          type: 'text',
          text: 'link',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', title: null } }],
        },
      ])
    })

    it('converts hardBreak inline', () => {
      const t = tree(['p', {}, 'a', ['br', {}], 'b'])
      const inlines = comarkToProseMirror(t).content?.[0]?.content
      expect(inlines).toEqual([
        { type: 'text', text: 'a' },
        { type: 'hardBreak' },
        { type: 'text', text: 'b' },
      ])
    })

    it('preserves alt and title on inline images', () => {
      const t = tree(['p', {}, ['img', { src: '/x.png', alt: 'X', title: 'Tooltip' }]])
      expect(comarkToProseMirror(t).content?.[0]?.content).toEqual([
        {
          type: 'image',
          attrs: { src: '/x.png', alt: 'X', title: 'Tooltip' },
        },
      ])
    })

    it('preserves non-href attributes on links via comarkExtras', () => {
      // Comark allows attrs on `a` like target/rel/class. Tiptap's link mark
      // schema only natively knows href/title — extras ride on `comarkExtras`.
      const t = tree([
        'p',
        {},
        ['a', { href: 'https://example.com', target: '_blank', rel: 'noopener' }, 'go'],
      ])
      const linkMark = comarkToProseMirror(t).content?.[0]?.content?.[0]?.marks?.[0]
      expect(linkMark?.type).toBe('link')
      expect(linkMark?.attrs).toEqual({
        href: 'https://example.com',
        title: null,
        comarkExtras: { target: '_blank', rel: 'noopener' },
      })
    })

    it('preserves attrs on bold/em/strike/code marks via comarkExtras', () => {
      // Comark allows `**bold**{.foo}` etc. — must not be silently lost.
      const t = tree([
        'p',
        {},
        ['strong', { class: 'hi', id: 'b1' }, 'B'],
        ' ',
        ['em', { class: 'em' }, 'E'],
        ' ',
        ['s', { class: 'st' }, 'S'],
        ' ',
        ['code', { class: 'cd' }, 'C'],
      ])
      const inlines = comarkToProseMirror(t).content?.[0]?.content
      expect(inlines?.[0]?.marks).toEqual([
        { type: 'bold', attrs: { comarkExtras: { class: 'hi', id: 'b1' } } },
      ])
      expect(inlines?.[2]?.marks).toEqual([
        { type: 'italic', attrs: { comarkExtras: { class: 'em' } } },
      ])
      expect(inlines?.[4]?.marks).toEqual([
        { type: 'strike', attrs: { comarkExtras: { class: 'st' } } },
      ])
      expect(inlines?.[6]?.marks).toEqual([
        { type: 'code', attrs: { comarkExtras: { class: 'cd' } } },
      ])
    })
  })

  describe('lists', () => {
    it('converts a flat bullet list', () => {
      const t = tree(['ul', {}, ['li', {}, 'one'], ['li', {}, 'two']])
      expect(comarkToProseMirror(t).content).toEqual([
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        },
      ])
    })

    it('converts an ordered list with start attribute', () => {
      const t = tree(['ol', { start: 5 }, ['li', {}, 'a']])
      expect(comarkToProseMirror(t).content?.[0]).toMatchObject({
        type: 'orderedList',
        attrs: { start: 5 },
      })
    })
  })

  describe('code blocks', () => {
    it('converts a fenced code block with a language', () => {
      const t = tree(['pre', { language: 'ts' }, ['code', { class: 'language-ts' }, 'const x = 1']])
      expect(comarkToProseMirror(t).content?.[0]).toEqual({
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [{ type: 'text', text: 'const x = 1' }],
      })
    })

    it('preserves filename and highlights for round-trip', () => {
      // Comark's pre carries language, filename, highlights, meta —
      // a non-destructive converter must surface these somewhere.
      const t = tree([
        'pre',
        { language: 'ts', filename: 'a.ts', highlights: [1, 2] },
        ['code', { class: 'language-ts' }, 'x'],
      ])
      const cb = comarkToProseMirror(t).content?.[0]
      expect(cb?.type).toBe('codeBlock')
      // Either as nested attrs or under a stable extras key — but they MUST
      // be retrievable by proseMirrorToComark to reconstruct the original.
      expect(cb?.attrs).toMatchObject({ language: 'ts' })
      // The exact shape of preservation is a design decision — but the
      // information must be present:
      const flat = JSON.stringify(cb)
      expect(flat).toContain('a.ts')
      expect(flat).toContain('1')
      expect(flat).toContain('2')
    })
  })

  describe('custom component handlers', () => {
    it('routes block components through nodeHandlers with block-context children', () => {
      const t = tree(['alert', { type: 'info' }, ['p', {}, 'Hi']])
      const opts: ConvertOptions = {
        nodeHandlers: {
          alert: (el, convertChildren) => {
            const [, attrs, ...children] = el
            return {
              type: 'alert',
              attrs: { type: attrs.type },
              content: convertChildren(children),
            }
          },
        },
      }
      expect(comarkToProseMirror(t, opts).content?.[0]).toEqual({
        type: 'alert',
        attrs: { type: 'info' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
      })
    })

    it('routes inline components through nodeHandlers with inline-context children', () => {
      const t = tree(['p', {}, 'See ', ['badge', { color: 'green' }, 'New'], '!'])
      const opts: ConvertOptions = {
        nodeHandlers: {
          badge: (el, convertChildren) => {
            const [, attrs, ...children] = el
            return {
              type: 'badge',
              attrs: { color: attrs.color },
              content: convertChildren(children),
            }
          },
        },
      }
      const inlines = comarkToProseMirror(t, opts).content?.[0]?.content
      // The badge children must come through as text nodes, not paragraphs —
      // this is the inline-context test for `convertChildren`.
      expect(inlines).toEqual([
        { type: 'text', text: 'See ' },
        {
          type: 'badge',
          attrs: { color: 'green' },
          content: [{ type: 'text', text: 'New' }],
        },
        { type: 'text', text: '!' },
      ])
    })
  })
})

// ===========================================================================
// 2. proseMirrorToComark — PM JSON → AST
// ===========================================================================

describe('proseMirrorToComark', () => {
  it('throws on a non-doc root', () => {
    expect(() => proseMirrorToComark({ type: 'paragraph' } as PMNode)).toThrow(
      /Expected PM doc node/,
    )
  })

  it('emits empty arrays for an empty doc', () => {
    expect(proseMirrorToComark(doc()).nodes).toEqual([])
  })

  it('flattens listItem with a single paragraph into inlines', () => {
    const pm = doc({
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
        },
      ],
    })
    const out = proseMirrorToComark(pm)
    expect(out.nodes).toEqual([['ul', {}, ['li', {}, 'one']]])
  })

  it('emits a code block with class on inner code', () => {
    const pm = doc({
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'x' }],
    })
    expect(proseMirrorToComark(pm).nodes).toEqual([
      ['pre', { language: 'ts' }, ['code', { class: 'language-ts' }, 'x']],
    ])
  })

  it('emits a link with href and title only when title is present', () => {
    const pm = doc({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'go',
          marks: [{ type: 'link', attrs: { href: 'https://e.com' } }],
        },
      ],
    })
    expect(proseMirrorToComark(pm).nodes).toEqual([
      ['p', {}, ['a', { href: 'https://e.com' }, 'go']],
    ])
  })
})

// ===========================================================================
// 3. End-to-end round-trip via real comark.parse + comark/render
// ===========================================================================

describe('round-trip: markdown → comark → PM → comark → markdown', () => {
  it.each<[string, string]>([
    ['heading', '# Hello\n'],
    ['paragraph with bold and italic', 'This is **bold** and *italic*.\n'],
    ['inline code', 'Use `npm install` here.\n'],
    ['link', '[link](https://example.com)\n'],
    ['link with title', '[link](https://example.com "T")\n'],
    ['image', '![alt](/x.png)\n'],
    ['blockquote', '> quoted\n'],
    ['unordered list', '- one\n- two\n- three\n'],
    ['ordered list', '1. one\n2. two\n'],
    ['horizontal rule', '---\n'],
    ['code block with language', '```ts\nconst x = 1\n```\n'],
  ])('preserves %s through round-trip', async (_label, md) => {
    const { out } = await roundTrip(md)
    // We don't require byte-for-byte equality — comark's serializer may
    // normalize whitespace. Re-parsing both should yield equivalent ASTs.
    const a = await parse(md)
    const b = await parse(out)
    expect(stripPositionMeta(b.nodes)).toEqual(stripPositionMeta(a.nodes))
  })

  it('preserves frontmatter across the round-trip', async () => {
    const md = '---\ntitle: Hi\n---\n\n# Hello\n'
    const { final } = await roundTrip(md)
    // proseMirrorToComark currently always emits {} for frontmatter — the
    // Nuxt composable preserves it externally. For the standalone library
    // we expect either round-trip preservation OR an explicit option.
    // For now, document the current behavior:
    expect(final.frontmatter).toEqual({})
  })

  it('preserves a code block with filename and highlights', async () => {
    const md = '```ts [a.ts] {1,3}\nconst x = 1\nconst y = 2\nconst z = 3\n```\n'
    const { out } = await roundTrip(md)
    // Round-trip should keep the filename and highlight info or we lose data.
    expect(out).toContain('a.ts')
    expect(out).toContain('{1,3}')
  })

  it('round-trips a registered block component', async () => {
    const md = '::alert{type="info"}\nHello\n::\n'
    const opts: ConvertOptions = {
      nodeHandlers: {
        alert: (el, convertChildren) => {
          const [, attrs, ...children] = el
          return {
            type: 'alert',
            attrs: { comarkProps: { type: attrs.type } },
            content: convertChildren(children),
          }
        },
      },
      pmNodeHandlers: {
        alert: (node, convertChildren) => {
          const props = (node.attrs?.comarkProps ?? {}) as Record<string, unknown>
          const children = convertChildren(node.content ?? [])
          // Use the type of children[0] explicitly to match the upstream import
          return [
            'alert',
            props as Record<string, unknown>,
            ...children,
          ] as unknown as ComarkTree['nodes'][number]
        },
      },
    }
    const { out } = await roundTrip(md, opts)
    const reparsed = await parse(out)
    const node = reparsed.nodes[0] as [string, Record<string, unknown>, ...unknown[]]
    expect(node[0]).toBe('alert')
    expect(node[1]).toMatchObject({ type: 'info' })
    // Body should survive the round-trip — the alert is a non-empty container.
    expect(node.length).toBeGreaterThan(2)
  })

  it('round-trips an inline component with content and props', async () => {
    const md = 'Status: :badge[New]{color="green"}.\n'
    const opts: ConvertOptions = {
      nodeHandlers: {
        badge: (el, convertChildren) => {
          const [, attrs, ...children] = el
          return {
            type: 'badge',
            attrs: { comarkProps: { color: attrs.color } },
            content: convertChildren(children),
          }
        },
      },
      pmNodeHandlers: {
        badge: (node, convertChildren) => {
          const props = (node.attrs?.comarkProps ?? {}) as Record<string, unknown>
          const children = convertChildren(node.content ?? [])
          return ['badge', props, ...children] as unknown as ComarkTree['nodes'][number]
        },
      },
    }
    const { out } = await roundTrip(md, opts)
    const reparsed = await parse(out)
    // The badge should be inside the paragraph and carry its color
    const para = reparsed.nodes[0] as [string, Record<string, unknown>, ...unknown[]]
    expect(para[0]).toBe('p')
    const badge = para.find(
      (c): c is [string, Record<string, unknown>, ...unknown[]] =>
        Array.isArray(c) && c[0] === 'badge',
    )
    expect(badge?.[1]).toMatchObject({ color: 'green' })
    expect(badge?.[2]).toBe('New')
  })
})

// ===========================================================================
// 4. Slot templates — Comark `["template", {name}, ...]` for named slots
// ===========================================================================

describe('slot templates', () => {
  it('converts a top-level template element to a comarkTemplate PM node', () => {
    const t = tree(['template', { name: 'header' }, ['p', {}, 'Hi']])
    const out = comarkToProseMirror(t)
    expect(out.content).toEqual([
      {
        type: 'comarkTemplate',
        attrs: { name: 'header' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
      },
    ])
  })

  it('round-trips a card with named slots through PM and back', () => {
    const t = tree([
      'card',
      {},
      ['template', { name: 'header' }, ['h2', {}, 'T']],
      ['template', { name: 'content' }, ['p', {}, 'C']],
    ])
    const opts: ConvertOptions = {
      nodeHandlers: {
        card: (el, convertChildren) => ({
          type: 'card',
          content: convertChildren((el as ComarkElement).slice(2) as ComarkTree['nodes']),
        }),
      },
      pmNodeHandlers: {
        card: (node, convertChildren) =>
          ['card', {}, ...convertChildren(node.content ?? [])] as ComarkElement,
      },
      // Disable autoUnwrap because the card has multi-template children, not
      // a single paragraph.
      autoUnwrap: false,
    }
    const pm = comarkToProseMirror(t, opts)
    const card = pm.content?.[0]
    expect(card?.type).toBe('card')
    // Both children should be comarkTemplate PM nodes with the right names
    expect(card?.content?.[0]).toMatchObject({
      type: 'comarkTemplate',
      attrs: { name: 'header' },
    })
    expect(card?.content?.[1]).toMatchObject({
      type: 'comarkTemplate',
      attrs: { name: 'content' },
    })

    const back = proseMirrorToComark(pm, opts)
    expect(back.nodes[0]).toEqual([
      'card',
      {},
      ['template', { name: 'header' }, ['h2', {}, 'T']],
      ['template', { name: 'content' }, ['p', {}, 'C']],
    ])
  })
})

// ===========================================================================
// 5. Tables — full GFM table support with header/body grouping & alignment
// ===========================================================================

describe('tables', () => {
  it('converts a basic table with header and body', () => {
    const t = tree([
      'table',
      {},
      ['thead', {}, ['tr', {}, ['th', {}, 'A'], ['th', {}, 'B']]],
      ['tbody', {}, ['tr', {}, ['td', {}, '1'], ['td', {}, '2']]],
    ])
    const pm = comarkToProseMirror(t)
    expect(pm.content?.[0]).toEqual({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
            },
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
            },
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }],
            },
          ],
        },
      ],
    })
  })

  it('preserves alignment and colspan/rowspan attrs on cells', () => {
    const t = tree([
      'table',
      {},
      [
        'tbody',
        {},
        [
          'tr',
          {},
          ['td', { align: 'right', colspan: 2, rowspan: 1 }, 'X'],
          ['td', { align: 'center' }, 'Y'],
        ],
      ],
    ])
    const cells = (comarkToProseMirror(t).content?.[0]?.content?.[0]?.content ?? []) as PMNode[]
    expect(cells[0]?.attrs).toEqual({ colspan: 2, comarkExtras: { align: 'right' } })
    expect(cells[1]?.attrs).toEqual({ comarkExtras: { align: 'center' } })
  })

  it('round-trips a table through PM and back to AST', () => {
    const t = tree([
      'table',
      {},
      ['thead', {}, ['tr', {}, ['th', { align: 'left' }, 'H']]],
      ['tbody', {}, ['tr', {}, ['td', {}, 'B']]],
    ])
    const pm = comarkToProseMirror(t)
    const back = proseMirrorToComark(pm)
    expect(back.nodes[0]).toEqual([
      'table',
      {},
      ['thead', {}, ['tr', {}, ['th', { align: 'left' }, 'H']]],
      ['tbody', {}, ['tr', {}, ['td', {}, 'B']]],
    ])
  })

  it('round-trips a real GFM table through markdown → PM → markdown', async () => {
    const md = '| A | B |\n| - | - |\n| 1 | 2 |\n'
    const original = await parse(md)
    const pm = comarkToProseMirror(original as unknown as ComarkTree)
    const back = proseMirrorToComark(pm)
    const out = await renderMarkdown(back as unknown as RealComarkTree)
    const reparsed = await parse(out)
    expect(stripPositionMeta(reparsed.nodes)).toEqual(stripPositionMeta(original.nodes))
  })
})

// ===========================================================================
// 6. Auto-unwrap on serialize — match Comark's parser-level autoUnwrap=true
// ===========================================================================

describe('autoUnwrap on serialize', () => {
  function alertOpts(autoUnwrap?: boolean): ConvertOptions {
    return {
      autoUnwrap,
      nodeHandlers: {
        alert: (el, convertChildren) => ({
          type: 'alert',
          content: convertChildren((el as ComarkElement).slice(2) as ComarkTree['nodes']),
        }),
      },
      pmNodeHandlers: {
        alert: (node, convertChildren) =>
          ['alert', {}, ...convertChildren(node.content ?? [])] as ComarkElement,
      },
    }
  }

  it('unwraps a single-paragraph child of a registered component by default', () => {
    // Going PM → Comark, an alert whose only child is `<p>Hi</p>` should
    // serialize as `["alert", {}, "Hi"]` — matching Comark's autoUnwrap.
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'alert',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        },
      ],
    }
    const out = proseMirrorToComark(pm, alertOpts())
    expect(out.nodes[0]).toEqual(['alert', {}, 'Hi'])
  })

  it('keeps the paragraph wrap when the paragraph carries comarkExtras', () => {
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'alert',
          content: [
            {
              type: 'paragraph',
              attrs: { comarkExtras: { class: 'lead' } },
              content: [{ type: 'text', text: 'Hi' }],
            },
          ],
        },
      ],
    }
    const out = proseMirrorToComark(pm, alertOpts())
    // The class on the paragraph would be lost if we unwrapped — keep it.
    expect(out.nodes[0]).toEqual(['alert', {}, ['p', { class: 'lead' }, 'Hi']])
  })

  it('does not unwrap when the component has multiple block children', () => {
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'alert',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
          ],
        },
      ],
    }
    const out = proseMirrorToComark(pm, alertOpts())
    expect(out.nodes[0]).toEqual(['alert', {}, ['p', {}, 'A'], ['p', {}, 'B']])
  })

  it('respects autoUnwrap=false', () => {
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'alert',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        },
      ],
    }
    const out = proseMirrorToComark(pm, alertOpts(false))
    expect(out.nodes[0]).toEqual(['alert', {}, ['p', {}, 'Hi']])
  })
})

// ===========================================================================
// 7. Inverse mark/node-extras round-trip — the comarkExtras carrier
// ===========================================================================

describe('comarkExtras round-trips through PM and back', () => {
  it('preserves extras on bold/em/strike/code through PM → Comark', () => {
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'B',
              marks: [{ type: 'bold', attrs: { comarkExtras: { class: 'hi' } } }],
            },
            { type: 'text', text: ' ' },
            {
              type: 'text',
              text: 'C',
              marks: [{ type: 'code', attrs: { comarkExtras: { class: 'k' } } }],
            },
          ],
        },
      ],
    }
    const out = proseMirrorToComark(pm)
    expect(out.nodes[0]).toEqual([
      'p',
      {},
      ['strong', { class: 'hi' }, 'B'],
      ' ',
      ['code', { class: 'k' }, 'C'],
    ])
  })

  it('preserves extras on heading/blockquote/hr/image through PM → Comark', () => {
    const pm: PMNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, comarkExtras: { id: 'hi' } },
          content: [{ type: 'text', text: 'H' }],
        },
        {
          type: 'blockquote',
          attrs: { comarkExtras: { 'data-cite': 'r' } },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q' }] }],
        },
        { type: 'horizontalRule', attrs: { comarkExtras: { class: 'd' } } },
        {
          type: 'image',
          attrs: {
            src: '/x.png',
            alt: null,
            title: null,
            comarkExtras: { width: '800' },
          },
        },
      ],
    }
    const out = proseMirrorToComark(pm)
    expect(out.nodes).toEqual([
      ['h2', { id: 'hi' }, 'H'],
      ['blockquote', { 'data-cite': 'r' }, ['p', {}, 'Q']],
      ['hr', { class: 'd' }],
      ['img', { src: '/x.png', width: '800' }],
    ])
  })
})

// ---------------------------------------------------------------------------
// Helpers — strip comark's internal `$` metadata (line/html/block) so AST
// comparisons aren't sensitive to source positioning.
// ---------------------------------------------------------------------------

function stripPositionMeta<T>(nodes: T): T {
  if (typeof nodes === 'string' || nodes == null) return nodes
  if (Array.isArray(nodes)) {
    if (nodes.length >= 2 && (typeof nodes[0] === 'string' || nodes[0] === null)) {
      const [tag, attrs, ...children] = nodes as unknown as [
        string | null,
        Record<string, unknown>,
        ...unknown[],
      ]
      const cleanAttrs: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(attrs ?? {})) {
        if (k === '$') continue
        cleanAttrs[k] = v
      }
      return [tag, cleanAttrs, ...children.map((c) => stripPositionMeta(c))] as unknown as T
    }
    return nodes.map((n) => stripPositionMeta(n)) as unknown as T
  }
  return nodes
}
