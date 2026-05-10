import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@zettelgeist/core': path.resolve(here, '../core/src/index.ts'),
      '@zettelgeist/fs-adapters': path.resolve(here, '../fs-adapters/src/index.ts'),
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.pw.test.ts'],
  },
});
