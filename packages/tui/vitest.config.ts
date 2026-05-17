import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'transform' },
  resolve: {
    alias: {
      // Resolve workspace packages to their source so tests don't need a
      // prior `pnpm -r build` step (CI runs tests before build). Matches
      // the alias setup in `packages/cli/vitest.config.ts`.
      '@zettelgeist/core': path.resolve(here, '../core/src/index.ts'),
      '@zettelgeist/fs-adapters': path.resolve(here, '../fs-adapters/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Ink renders are async; default 5s is enough but we surface it
    // explicitly so a slow CI runner doesn't silently flake.
    testTimeout: 10_000,
    // The TUI views render once and assert against the frame buffer —
    // serialising avoids competing for stdout in ink-testing-library
    // when multiple tests boot at once.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
