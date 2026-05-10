import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'happy-dom',
  },
  resolve: {
    alias: {
      '@zettelgeist/core': path.resolve(here, '../core/src/index.ts'),
    },
  },
});
