#!/usr/bin/env node
// Build the VSCode extension:
//   1. esbuild bundles src/extension.ts -> dist/extension.js (CommonJS, the
//      format VSCode expects). The 'vscode' module is marked external — it's
//      provided by the host at runtime.
//   2. Copy @zettelgeist/viewer's dist/ into dist/webview-bundle/ so the
//      webview can load it via localResourceRoots.

import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await esbuild.build({
  entryPoints: [path.join(root, 'src/extension.ts')],
  bundle: true,
  outfile: path.join(root, 'dist/extension.js'),
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
});

const viewerDist = path.resolve(root, '../viewer/dist');
const webviewBundle = path.join(root, 'dist/webview-bundle');
await fs.rm(webviewBundle, { recursive: true, force: true });
await fs.mkdir(webviewBundle, { recursive: true });
await copyDir(viewerDist, webviewBundle);

console.log(`vscode-extension built → ${path.relative(process.cwd(), root)}/dist/`);

async function copyDir(src, dst) {
  let entries;
  try { entries = await fs.readdir(src, { withFileTypes: true }); }
  catch (err) {
    console.error(`viewer bundle missing at ${src} — run \`pnpm --filter @zettelgeist/viewer build\` first.`);
    throw err;
  }
  for (const entry of entries) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dp, { recursive: true });
      await copyDir(sp, dp);
    } else {
      await fs.copyFile(sp, dp);
    }
  }
}
