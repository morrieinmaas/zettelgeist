import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

// Bundle the CLI binary. Internal workspace + own modules get inlined; npm deps stay external.
await esbuild.build({
  entryPoints: [path.join(root, 'src/bin.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(dist, 'bin.js'),
  target: 'node20',
  sourcemap: 'linked',
  minify: false,
  banner: { js: '#!/usr/bin/env node\n' },
  // Externalize npm deps so they're loaded from node_modules at runtime
  external: [
    '@modelcontextprotocol/sdk',
    'marked',
    'gray-matter',
    'js-yaml',
    'zod',
    'zod-to-json-schema',
  ],
  logLevel: 'info',
});

console.log('cli bundled →', path.join(dist, 'bin.js'));
