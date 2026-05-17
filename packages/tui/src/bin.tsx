import React from 'react';
import { render } from 'ink';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { App, type View } from './app.js';

// Replaced at bundle time via esbuild's `define` (see scripts/bundle.mjs);
// never read from source — `package.json`'s `bin` only points at
// `dist/bin.js`, so the only way this symbol is reached at runtime is
// after esbuild has substituted a literal string here.
declare const __ZG_TUI_VERSION__: string;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.includes('--version')) {
    process.stdout.write(`zg-tui ${__ZG_TUI_VERSION__}\n`);
    return 0;
  }

  let initialView: View = 'board';
  const viewArg = argv.find((a) => a.startsWith('--view='));
  if (viewArg) {
    const v = viewArg.slice('--view='.length);
    if (v === 'board' || v === 'detail' || v === 'graph' || v === 'docs') initialView = v;
  }

  const cwd = process.cwd();
  // Refuse to run outside a Zettelgeist repo. Cleanest UX: bail before
  // Ink takes over the terminal.
  try {
    await fs.access(path.join(cwd, '.zettelgeist.yaml'));
  } catch {
    process.stderr.write(
      `zg-tui: no .zettelgeist.yaml found in ${cwd}. Run inside a Zettelgeist repo or initialize one.\n`,
    );
    return 2;
  }

  // `render` returns a controller with `.waitUntilExit()` — we await that so
  // the process stays alive until the user quits via `q` / `Ctrl-C`.
  const instance = render(<App cwd={cwd} initialView={initialView} />);

  // Belt-and-braces: Ink already converts Ctrl-C inside the alternate
  // screen into a clean unmount, but if the parent shell sends SIGINT
  // before Ink takes over (e.g., during the async load), `instance.unmount()`
  // restores the terminal. Without this, an aborted boot leaves the TTY
  // in a half-initialised state.
  const onSignal = (): void => {
    try { instance.unmount(); } catch { /* already unmounted */ }
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await instance.waitUntilExit();
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
  return 0;
}

const HELP = `zg-tui — terminal UI for Zettelgeist

  Run inside a directory containing .zettelgeist.yaml. Opens an interactive
  view of the spec board, detail, dependency graph, and docs.

  Usage:
    zg-tui [--view=board|detail|graph|docs]
    zg-tui --help
    zg-tui --version

  Keys (in-app):
    ↑↓ ←→ / hjkl   navigate
    enter          open / select
    1 2 3 4        jump to board / detail / graph / docs
    tab            cycle views
    ?              command palette
    q / Ctrl-C     quit
`;

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`zg-tui: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
