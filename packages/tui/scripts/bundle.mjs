import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src/bin.tsx')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(dist, 'bin.js'),
  target: 'node20',
  sourcemap: 'linked',
  minify: false,
  banner: { js: '#!/usr/bin/env node\n' },
  jsx: 'transform',
  external: [
    // Keep these external — they have native + lifecycle quirks that don't
    // bundle cleanly; npm install resolves them in node_modules at runtime.
    // Ink's own native layout dep (`yoga-layout`) is reached transitively
    // through `ink` (which IS external), so we don't need to name it here.
    // Earlier versions listed `yoga-wasm-web` but that's a different package
    // and not on our dependency graph.
    'ink',
    'react',
    'gray-matter',
    'js-yaml',
  ],
  logLevel: 'info',
});

console.log('tui bundled →', path.join(dist, 'bin.js'));
