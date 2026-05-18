import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist tui [--view=board|detail|graph|docs]

  Launch the Zettelgeist terminal UI (board / detail / graph / docs).

  This is a thin shim that spawns the \`zg-tui\` binary from the
  \`@zettelgeist/tui\` package — it's installed alongside the CLI when you
  add \`@zettelgeist/tui\` to your dependencies. If the binary isn't on
  PATH (and isn't in a local \`node_modules/.bin\`), this command prints
  install instructions instead of erroring obscurely.

  Pass-through flags:
    --view=<name>   Open directly on board / detail / graph / docs.
    --help          Show zg-tui's own help (delegated when available).
`;

export interface TuiInput {
  cwd: string;
  view?: string | undefined;
}

export interface TuiOk {
  exitCode: number;
  binary: string;
}

/**
 * Locate the `zg-tui` binary. We probe (in order):
 *   1. `<cwd>/node_modules/.bin/zg-tui` — local install
 *   2. PATH lookup — relies on the shell finding it
 * Returns null if neither is present.
 */
async function locateZgTui(cwd: string): Promise<string | null> {
  const local = path.join(cwd, 'node_modules', '.bin', 'zg-tui');
  try {
    await fs.access(local);
    return local;
  } catch {
    /* fall through to PATH probe */
  }
  // Shell-search PATH. spawn('zg-tui', ...) will fail with ENOENT if
  // missing; we'd rather detect upfront so the error message can be useful.
  const PATH = process.env['PATH'] ?? '';
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'zg-tui');
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

export async function tuiCommand(input: TuiInput): Promise<Envelope<TuiOk>> {
  const binary = await locateZgTui(input.cwd);
  if (binary === null) {
    return errorEnvelope(
      'tui: zg-tui not found. Install with `pnpm add @zettelgeist/tui` ' +
        '(or `npm i @zettelgeist/tui`) — the binary ships with that package.',
    );
  }

  const args: string[] = [];
  if (input.view) args.push(`--view=${input.view}`);

  return await new Promise<Envelope<TuiOk>>((resolve) => {
    const child = spawn(binary, args, { cwd: input.cwd, stdio: 'inherit' });
    child.on('error', (err) => {
      resolve(errorEnvelope(`tui: ${err.message}`));
    });
    child.on('exit', (code) => {
      resolve(okEnvelope({ exitCode: code ?? 0, binary }));
    });
  });
}
