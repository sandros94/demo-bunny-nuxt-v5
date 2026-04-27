# tiptap-comark

A complete Tiptap editor schema for [Comark](https://github.com/comark/comark) documents.

The PM JSON shape, the Comark AST, and the markdown string are three views of the
same document. Round-trip is lossless because the schema covers every Comark
feature directly — `class`/`id`/`style`/`data-*`/`aria-*` are native PM attrs on
nodes _and_ marks; tables, slot templates, comments, and components are
first-class node types; nothing rides on a generic carrier object.

## Status

Work in progress. The kit is being developed inside the demo-bunny-nuxt-v5
repository before being lifted into the upstream Comark monorepo.

## Quick look

```ts
import { Editor } from '@tiptap/core'
import { ComarkKit, ComarkComponent } from 'tiptap-comark'

const editor = new Editor({
  extensions: [
    ComarkKit,
    ComarkComponent.create({ name: 'alert', kind: 'block', schema, nodeView }),
  ],
})

editor.commands.setComarkMarkdown('# Hello\n\n::alert\nHi\n::')
editor.commands.setComarkAst(tree)

editor.storage.comark.getMarkdown() // -> string
editor.storage.comark.getAst() // -> ComarkTree
```

## Why a complete kit?

Trying to bolt Comark's expressiveness onto Tiptap's StarterKit defaults forced
information into a `comarkExtras` carrier — clean for round-trip but second-class
in the schema. ProseMirror has always allowed nodes _and_ marks to declare any
attributes they want; Tiptap exposes that via `Mark.create({ addAttributes() })`.
This kit takes the obvious option: declare the schema Comark actually needs.
