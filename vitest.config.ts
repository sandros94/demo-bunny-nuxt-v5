import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: {
            '~/': './app',
            '#shared': './shared',
          },
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
          maxConcurrency: 8,
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      }),
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.{test,spec}.ts'],
          environment: 'node',
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
})
