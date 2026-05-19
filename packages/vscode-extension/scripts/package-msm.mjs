#!/usr/bin/env node
/**
 * Build a VS Code Marketplace-flavored .vsix.
 *
 * The committed publisher in `package.json` is `morrieinmaas` (matches
 * the long-lived Open VSX listing). The VS Code Marketplace listing is
 * under a different publisher (`morriearty-zg`) for unrelated reasons.
 * This script temporarily swaps the publisher field, runs `vsce package`,
 * then restores the original — producing
 * `zettelgeist-msm-<version>.vsix` ready for manual MS Marketplace upload
 * without affecting the working tree on completion.
 *
 * Usage:
 *   node scripts/package-msm.mjs            # writes zettelgeist-msm-<version>.vsix
 *   MSM_PUBLISHER=foo node scripts/package-msm.mjs   # override publisher
 *
 * The restoration is in a try/finally so a vsce failure still leaves
 * the committed package.json intact. If you crash this with SIGKILL
 * mid-flight, just `git checkout packages/vscode-extension/package.json`
 * to undo the in-flight swap.
 */

import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const MSM_PUBLISHER = process.env.MSM_PUBLISHER ?? 'morriearty-zg';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const pkgPath = path.join(pkgRoot, 'package.json');

const originalRaw = await fs.readFile(pkgPath, 'utf8');
const original = JSON.parse(originalRaw);
const version = original.version;
const sourcePublisher = original.publisher;

if (sourcePublisher === MSM_PUBLISHER) {
  // The committed package.json already targets the MSM publisher.
  // Run a normal `vsce package` and rename the output for symmetry.
  console.warn(
    `[package-msm] package.json already declares publisher='${MSM_PUBLISHER}'; ` +
      `running a plain build.`,
  );
}

// Swap publisher in place (vsce reads the file from disk). We intentionally
// preserve formatting via a regex replace rather than a full
// JSON.stringify round-trip to keep the diff trivial in case anything
// goes sideways.
const swapped = originalRaw.replace(
  /"publisher":\s*"[^"]+"/,
  `"publisher": "${MSM_PUBLISHER}"`,
);
if (swapped === originalRaw && sourcePublisher !== MSM_PUBLISHER) {
  throw new Error(
    `[package-msm] could not locate a "publisher" field in package.json ` +
      `to swap. Check the file shape.`,
  );
}

try {
  await fs.writeFile(pkgPath, swapped, 'utf8');

  // Output filename has -msm suffix so it can't be confused with the
  // Open VSX build sitting next to it.
  const outFile = `zettelgeist-msm-${version}.vsix`;
  const vsceArgs = ['--yes', '@vscode/vsce', 'package', '--no-dependencies', '--out', outFile];

  console.log(`[package-msm] packaging with publisher='${MSM_PUBLISHER}' → ${outFile}`);
  await new Promise((resolve, reject) => {
    const child = spawn('npx', vsceArgs, { cwd: pkgRoot, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`vsce exited ${code}`))));
  });
  console.log(`[package-msm] done → ${path.join(pkgRoot, outFile)}`);
} finally {
  // ALWAYS restore the committed publisher. Even if vsce fails, we don't
  // want a half-applied swap polluting the working tree.
  await fs.writeFile(pkgPath, originalRaw, 'utf8');
}
