import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '..');
const viewerDist = path.resolve(cliRoot, '../viewer/dist');
const targetDir = path.join(cliRoot, 'dist', 'viewer-bundle');

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });

// Diagnostics: when this script complains, the next-screenful debug should
// include the resolved path AND the underlying error, not just "empty".
let entries;
try {
  entries = await fs.readdir(viewerDist, { withFileTypes: true });
} catch (err) {
  console.error(`could not read viewer dist at ${viewerDist}: ${err.message}`);
  console.error('→ run "pnpm --filter @zettelgeist/viewer build" first.');
  process.exit(1);
}
if (entries.length === 0) {
  console.error(`viewer dist is empty at ${viewerDist}`);
  console.error('→ run "pnpm --filter @zettelgeist/viewer build" first.');
  process.exit(1);
}

// Recursive copy — esbuild splitting may emit subdirectories. The previous
// flat copyFile would error opaquely when it hit any directory entry.
async function copyTree(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const list = await fs.readdir(src, { withFileTypes: true });
  for (const e of list) {
    const sp = path.join(src, e.name);
    const dp = path.join(dst, e.name);
    if (e.isDirectory()) await copyTree(sp, dp);
    else await fs.copyFile(sp, dp);
  }
}
await copyTree(viewerDist, targetDir);
const flat = await fs.readdir(targetDir, { recursive: true });
console.log(`copied ${flat.length} viewer files → ${targetDir}`);
