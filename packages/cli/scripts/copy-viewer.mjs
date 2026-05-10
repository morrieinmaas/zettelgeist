import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '..');
const viewerDist = path.resolve(cliRoot, '../viewer/dist');
const targetDir = path.join(cliRoot, 'dist', 'viewer-bundle');

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });

const files = await fs.readdir(viewerDist).catch(() => []);
if (files.length === 0) {
  console.error('viewer dist is empty — run "pnpm --filter @zettelgeist/viewer build" first');
  process.exit(1);
}

for (const f of files) {
  await fs.copyFile(path.join(viewerDist, f), path.join(targetDir, f));
}

console.log(`copied ${files.length} viewer files → ${targetDir}`);
