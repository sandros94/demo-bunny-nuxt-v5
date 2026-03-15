import type { Nitro, NitroPreset } from 'nitro/types'
import { builtinModules } from 'node:module'
import { rm } from 'node:fs/promises'

export default <NitroPreset>{
  entry: './preset/bunny-entry.ts',

  exportConditions: ['deno'],
  commands: {
    preview: 'deno -A ./index.mjs',
  },

  output: {
    dir: '{{ rootDir }}/.output',
    serverDir: '{{ output.dir }}',
    publicDir: '{{ output.dir }}/public',
  },

  rollupConfig: {
    output: {
      format: 'esm',
      entryFileNames: 'index.mjs',
      inlineDynamicImports: true,
      hoistTransitiveImports: false,
    },
    external: (id: string) =>
      id.startsWith('https://') || id.startsWith('node:') || builtinModules.includes(id),
  },

  serveStatic: 'inline',
  minify: true,

  hooks: {
    'build:before': (nitro: Nitro) => {
      if (nitro.options.serveStatic !== 'inline' && nitro.options.serveStatic !== false) {
        nitro.options.serveStatic = 'inline'
        nitro.logger.warn(
          'Bunny Edge Scripting preset requires `serveStatic` to be `inline` or `false`. Overriding to `inline`.',
        )
      }
    },
    async 'compiled'(nitro: Nitro) {
      // Remove public dir when inlined, usecase is for
      // managing assets directly in Bunny Storage
      if (nitro.options.serveStatic === 'inline') {
        const publicDir = nitro.options.output.publicDir
        await rm(publicDir, { recursive: true, force: true })
      }
    },
  },
}
