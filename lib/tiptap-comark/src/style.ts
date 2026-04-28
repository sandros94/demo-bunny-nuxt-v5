/**
 * Operational CSS for kit-specific markers — a deliberate opt-out of
 * "default visual prose" and a deliberate opt-in to "make editor-only
 * constructs visible."
 *
 * Three node types in the kit have no inherent rendering: the Comark
 * comment (`[null, attrs, "text"]`), the template slot
 * (`["template", { name }, …]`), and any user-defined component
 * (`["alert", …]`, `[":badge", …]`) that hasn't been given a NodeView.
 * Without a stylesheet, all three render as bare `<div>` / `<span>`
 * elements — invisible in the editor.
 *
 * What's intentionally NOT here:
 *   - Heading scale, list-marker styles, blockquote borders, link
 *     colors, code-block frames — those are *visual prose* concerns,
 *     and shipping them would conflict with Tailwind Typography,
 *     Nuxt UI's Prose system, and any hand-rolled prose stylesheet.
 *   - `.ProseMirror`-scoped operational CSS (gap cursor, selection,
 *     contenteditable wrapping) — that's Tiptap core's job and is
 *     already injected for free when `injectCSS: true` (the default).
 *
 * Selectors keep specificity low (single attribute, no chained class,
 * no descendant combinators) and avoid `!important`, so a host
 * stylesheet that loads after this one — Nuxt UI, a `prose` override,
 * a power user's CSS — always wins on collision. Properties default
 * to `currentColor` so the kit picks up the host's foreground color
 * automatically and works in light/dark themes without a media query.
 *
 * Every kit selector also adds `:not([data-node-view-wrapper])` —
 * Tiptap stamps `data-node-view-wrapper` on the host element of any
 * `addNodeView` registration (Vue, React, plain), and consumers who
 * provide a NodeView are explicitly taking over rendering. Without
 * the exclusion, our `::before` marker text and our own padding /
 * border would stack on top of theirs.
 *
 * For libraries that want to ship a complete look-and-feel of their
 * own, the auto-inject is disabled with `ComarkSerializer.configure({
 * injectStyles: false })` and the `comarkStyle` string can be re-used
 * (or completely replaced) in their own stylesheet pipeline.
 */

/**
 * The CSS payload. Exported as a string so consumers can pipe it into
 * an SSR `<style>` tag, a CSP-nonce'd injection, a Shadow DOM, or a
 * custom build step.
 */
export const comarkStyle = `[data-comark-comment]:not([data-node-view-wrapper]) {
  display: block;
  padding: 0.25em 0.5em;
  margin: 0.5em 0;
  border-left: 3px solid currentColor;
  opacity: 0.6;
  font-style: italic;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.875em;
}

[data-comark-comment]:not([data-node-view-wrapper])::before {
  content: "// " attr(data-comark-comment);
}

[data-comark-template]:not([data-node-view-wrapper]) {
  display: block;
  position: relative;
  padding: 0.5em;
  margin: 0.5em 0;
  border: 1px dashed currentColor;
  opacity: 0.85;
}

[data-comark-template]:not([data-node-view-wrapper])[data-slot]::before {
  content: "#" attr(data-slot);
  display: block;
  margin-bottom: 0.25em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75em;
  opacity: 0.65;
}

div[data-comark-component]:not([data-node-view-wrapper]) {
  display: block;
  position: relative;
  padding: 0.5em;
  margin: 0.5em 0;
  border: 1px solid currentColor;
  opacity: 0.85;
}

div[data-comark-component]:not([data-node-view-wrapper])::before {
  content: "::" attr(data-comark-component);
  display: block;
  margin-bottom: 0.25em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75em;
  opacity: 0.65;
}

span[data-comark-component]:not([data-node-view-wrapper]) {
  display: inline;
  padding: 0 0.25em;
  border: 1px solid currentColor;
  border-radius: 0.25em;
  opacity: 0.85;
}
`

/**
 * Marker on the auto-injected `<style>` tag. Same approach Tiptap core
 * uses for `data-tiptap-style` — a single tag per document, regardless
 * of how many editor instances exist.
 */
export const COMARK_STYLE_MARKER = 'data-comark-style'

/**
 * Idempotent insertion of the kit stylesheet into `document.head`.
 * Returns the existing tag if one is already present (so multiple
 * editors share one tag), creates and appends otherwise. No-op when
 * `document` is undefined (SSR / Node environment) — the editor never
 * mounts there anyway.
 *
 * @param nonce  CSP nonce to set on the style tag, mirroring Tiptap
 *               core's `injectNonce` option. Leave undefined for envs
 *               without a strict CSP.
 */
export function injectComarkStyles(nonce?: string): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null

  const existing = document.querySelector<HTMLStyleElement>(`style[${COMARK_STYLE_MARKER}]`)
  if (existing) return existing

  const styleNode = document.createElement('style')
  styleNode.setAttribute(COMARK_STYLE_MARKER, '')
  if (nonce) styleNode.setAttribute('nonce', nonce)
  styleNode.textContent = comarkStyle
  document.head.appendChild(styleNode)
  return styleNode
}
