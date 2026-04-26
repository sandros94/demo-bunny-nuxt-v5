/**
 * E2E tests for the `/editor` demo page.
 *
 * Two layers of coverage:
 *
 *   1. SSR fetch — confirms the page returns 200 and the parsed Comark AST
 *      is rendered into the server-side debug pane (so the converter is
 *      exercised even without a browser).
 *
 *   2. Browser via `@nuxt/test-utils/e2e`'s `createPage` (Playwright under
 *      the hood) — drives the real Tiptap editor, asserts on rendered DOM
 *      and verifies localStorage persistence + the Reset button flow.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  buildFixture,
  createPage,
  createTestContext,
  fetch,
  loadFixture,
  setTestContext,
  startServer,
  stopServer,
} from '@nuxt/test-utils/e2e'

describe('e2e: /editor demo page', () => {
  beforeAll(async () => {
    const ctx = createTestContext({ nuxtConfig: {} })
    setTestContext(ctx)
    await loadFixture()
    await buildFixture()
    await startServer()
  }, 120_000)

  afterAll(async () => {
    await stopServer()
  })

  // ---------------------------------------------------------------------
  // 1. SSR fetch — no browser, exercises the converter on the server.
  // ---------------------------------------------------------------------

  describe('SSR', () => {
    it('returns 200', async () => {
      const res = await fetch('/editor')
      expect(res.status).toBe(200)
    })

    it('renders the page header and reset control', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('Comark editor demo')
      expect(html).toContain('Reset to seed')
    })

    it('renders the ClientOnly fallback while the editor hydrates', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('Loading editor')
      expect(html).toContain('data-test="editor-fallback"')
    })

    it('parses frontmatter out of the seed and exposes it in the debug pane', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('Comark Editor Demo')
      expect(html).toContain('author')
    })

    it('parses the body into a Comark AST that reaches the SSR HTML', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('Welcome to the Comark editor')
      expect(html).toContain('alert')
      expect(html).toContain('strong')
      expect(html).toContain('blockquote')
      expect(html).toContain('table')
      expect(html).toContain('thead')
      expect(html).toContain('pre')
      expect(html).toContain('language-ts')
    })

    it('preserves component props in the parsed AST (alert{type="info"})', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('info')
      expect(html).toContain('Heads up')
    })

    it('preserves a code block filename and highlight metadata', async () => {
      const html = await fetch('/editor').then((r) => r.text())
      expect(html).toContain('example.ts')
      expect(html).toContain('highlights')
    })
  })

  // ---------------------------------------------------------------------
  // 2. Browser — boots a real Chromium via Playwright and drives the
  //    hydrated editor end to end.
  // ---------------------------------------------------------------------

  describe('Browser', () => {
    // Booting Playwright + first-time Vite cold compile of /editor is well
    // beyond the 30s default; give every browser test a generous ceiling.
    const BROWSER_TIMEOUT = 90_000

    it(
      'hydrates and renders the editor with the seed content',
      { timeout: BROWSER_TIMEOUT },
      async () => {
        const page = await createPage('/editor')
        // Defaults are 30s for every action/locator — bump in line with the
        // outer test timeout so first-paint Vite delays don't trip us.
        page.setDefaultTimeout(60_000)
        // Wait for the SSR fallback to be replaced by the hydrated editor.
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.locator('h1', { hasText: 'Welcome to the Comark editor' }).waitFor()
        // The custom alert NodeView should mount with the right type/title.
        await page.locator('[data-comark-component="alert"]').first().waitFor()
        const alertWithTitle = page.locator('[data-comark-component="alert"]', {
          hasText: 'Heads up',
        })
        expect(await alertWithTitle.count()).toBeGreaterThan(0)
        expect(await alertWithTitle.first().isVisible()).toBe(true)
        await page.close()
      },
    )

    it(
      'persists edits to localStorage and restores them on reload',
      { timeout: BROWSER_TIMEOUT },
      async () => {
        const page = await createPage('/editor')
        // Wait for hydration before reading storage.
        await page.locator('h1', { hasText: 'Welcome to the Comark editor' }).waitFor()

        // Type a marker into the editor's contenteditable region.
        const editorContent = page.locator('.ProseMirror').first()
        await editorContent.click()
        // End-of-doc, then a fresh paragraph with our marker.
        await page.keyboard.press('ControlOrMeta+End')
        await page.keyboard.press('Enter')
        await page.keyboard.type('PERSISTED-MARKER')

        // Wait for the marker to land in localStorage (debounced via the
        // model→source watcher chain).
        await expect
          .poll(() => page.evaluate(() => window.localStorage.getItem('comark-demo-doc') ?? ''), {
            timeout: 5_000,
          })
          .toContain('PERSISTED-MARKER')

        // Reload — the editor should rehydrate from localStorage, not the seed.
        await page.reload()
        await page
          .locator('.ProseMirror', { hasText: 'PERSISTED-MARKER' })
          .waitFor({ timeout: 5_000 })
        await page.close()
      },
    )

    it(
      'Reset to seed clears localStorage and restores the original doc',
      { timeout: BROWSER_TIMEOUT },
      async () => {
        const page = await createPage('/editor')
        await page.locator('h1', { hasText: 'Welcome to the Comark editor' }).waitFor()

        // Plant a marker in storage so we can confirm the reset cleared it.
        await page.evaluate(() => {
          window.localStorage.setItem(
            'comark-demo-doc',
            JSON.stringify({
              nodes: [['p', {}, 'STALE-MARKER']],
              frontmatter: {},
              meta: {},
            }),
          )
        })
        await page.reload()
        await page.locator('.ProseMirror', { hasText: 'STALE-MARKER' }).waitFor({ timeout: 5_000 })

        // Click the reset button.
        await page.locator('[data-test="reset"]').click()

        // The seed heading should be back…
        await page
          .locator('h1', { hasText: 'Welcome to the Comark editor' })
          .waitFor({ timeout: 5_000 })
        // …and the stale marker should be gone from both DOM and storage.
        const proseMirrorText = await page.locator('.ProseMirror').first().textContent()
        expect(proseMirrorText ?? '').not.toContain('STALE-MARKER')
        const stored = await page.evaluate(() => window.localStorage.getItem('comark-demo-doc'))
        // Reset clears storage; the next edit will write the fresh doc, so
        // the value is either `null` or a freshly-written tree — neither
        // form should still carry the stale marker. Coercing `null` to ''
        // sidesteps a conditional expect.
        expect(stored ?? '').not.toContain('STALE-MARKER')
        await page.close()
      },
    )
  })
})
