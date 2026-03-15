import { defineConfig } from 'vite-plus'

const ignorePatterns = [
  '.output/**',
  '.data/**',
  '.nuxt/**',
  '.nitro/**',
  '.cache/**',
  'dist/**',
  'node_modules/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
]

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },

  test: {
    include: ['**/*.test.ts'],
  },

  lint: {
    plugins: ['unicorn', 'typescript', 'oxc', 'vue', 'vitest'],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns,
  },

  fmt: {
    ignorePatterns,
    singleQuote: true,
    quoteProps: 'consistent',
    trailingComma: 'all',
    semi: false,
  },

  staged: {
    '*': 'vp check --fix',
  },
})
