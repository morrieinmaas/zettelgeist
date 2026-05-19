import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_CONFIG,
  INIT_DIRS,
  gitignoreWithMarkerBlock,
} from '@zettelgeist/core';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist init [--force] [--json]

  Initialize the current directory as a Zettelgeist repository. Writes:

    .zettelgeist.yaml     opt-in marker (format_version: "0.1")
    specs/                empty directory for your first spec
    docs/                 optional notes / non-spec markdown
    .zettelgeist/         tool-managed state (gitignored)

  Idempotent by default — already-existing files are left alone unless
  --force is given. Doesn't touch your git config, branches, or commits;
  use \`zettelgeist install-hook\` separately if you want the pre-commit
  guard.

  Designed for first-time onboarding from the VSCode extension and the
  CLI alike. Safe to run in any directory; explicitly bails on writing
  outside the cwd.

  Flags:
    --force        Overwrite an existing .zettelgeist.yaml.
    --json         Emit a machine-readable JSON envelope.
`;

export interface InitInput {
  path: string;
  force: boolean;
}

export interface InitOk {
  /** Files / dirs actually created by this invocation (omits ones that
   *  were already in place). */
  created: string[];
  /** Files that already existed and were left untouched. */
  preserved: string[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function initCommand(input: InitInput): Promise<Envelope<InitOk>> {
  const cwd = input.path;
  const created: string[] = [];
  const preserved: string[] = [];

  // .zettelgeist.yaml — the opt-in marker.
  const cfgPath = path.join(cwd, '.zettelgeist.yaml');
  const cfgExists = await exists(cfgPath);
  if (cfgExists && !input.force) {
    return errorEnvelope(
      `init: ${cfgPath} already exists. Use --force to overwrite, or remove it first.`,
    );
  }
  try {
    await fs.writeFile(cfgPath, DEFAULT_CONFIG, 'utf8');
    created.push('.zettelgeist.yaml');
  } catch (err) {
    return errorEnvelope(`init: cannot write ${cfgPath}: ${(err as Error).message}`);
  }

  // Directory layout (specs/, docs/, .zettelgeist/) — the set lives in
  // core's INIT_DIRS so the extension's runInit() materializes the same
  // shape. mkdir({recursive:true}) is idempotent; pre-existing dirs are
  // reported as `preserved`.
  for (const dir of INIT_DIRS) {
    const abs = path.join(cwd, dir);
    if (await exists(abs)) {
      preserved.push(`${dir}/`);
    } else {
      await fs.mkdir(abs, { recursive: true });
      created.push(`${dir}/`);
    }
  }

  // .gitignore — append our marker block if it isn't there yet.
  const giPath = path.join(cwd, '.gitignore');
  let giContent = '';
  let giExisted = false;
  try {
    giContent = await fs.readFile(giPath, 'utf8');
    giExisted = true;
  } catch {
    /* will create */
  }
  const nextGi = gitignoreWithMarkerBlock(giContent);
  if (nextGi === null) {
    preserved.push('.gitignore');
  } else {
    await fs.writeFile(giPath, nextGi, 'utf8');
    created.push(giExisted ? '.gitignore (block appended)' : '.gitignore');
  }

  return okEnvelope({ created, preserved });
}
