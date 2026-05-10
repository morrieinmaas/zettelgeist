import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

// Bundle main.ts → dist/main.js
await esbuild.build({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  format: 'esm',
  outfile: path.join(dist, 'main.js'),
  target: 'es2022',
  sourcemap: 'linked',
  minify: false,
  logLevel: 'info',
});

// Copy index.html with bundled main.js + base.css references
const html = await fs.readFile(path.join(root, 'src/index.html'), 'utf8');
await fs.writeFile(path.join(dist, 'index.html'), html, 'utf8');

// Copy CSS
const cssFiles = ['base.css', 'board.css', 'detail.css', 'docs.css'];
for (const f of cssFiles) {
  await fs.copyFile(
    path.join(root, 'src/styles', f),
    path.join(dist, f),
  );
}

// Copy Pico.css from node_modules into dist
const picoSrc = path.resolve(root, '../../node_modules/@picocss/pico/css/pico.classless.min.css');
try {
  await fs.copyFile(picoSrc, path.join(dist, 'pico.classless.min.css'));
} catch {
  // pico might be hoisted differently; try the package's own node_modules
  const altSrc = path.join(root, 'node_modules/@picocss/pico/css/pico.classless.min.css');
  await fs.copyFile(altSrc, path.join(dist, 'pico.classless.min.css'));
}

console.log('viewer built →', dist);
