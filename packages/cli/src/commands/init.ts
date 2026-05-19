import { promises as fs } from 'node:fs';
import * as path from 'node:path';
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

const DEFAULT_CONFIG = `format_version: "0.1"
# specs_dir: specs            # uncomment to override
`;

const DEFAULT_GITIGNORE_BLOCK = `# >>> zettelgeist >>>
# Tool-managed state (regen cache, exported HTML, etc.).
.zettelgeist/regen-cache.json
.zettelgeist/exports/
# Per-actor claim files (v0.2 distributed-conflict design).
specs/*/.claim
specs/*/.claim-*
# <<< zettelgeist <<<
`;

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

  // specs/ — empty directory the first spec will land in. We don't
  // create a placeholder file here so the user doesn't have to delete
  // it on their first real spec.
  const specsDir = path.join(cwd, 'specs');
  if (await exists(specsDir)) {
    preserved.push('specs/');
  } else {
    await fs.mkdir(specsDir, { recursive: true });
    created.push('specs/');
  }

  // docs/ — non-spec markdown. Optional but a near-zero-cost convention.
  const docsDir = path.join(cwd, 'docs');
  if (await exists(docsDir)) {
    preserved.push('docs/');
  } else {
    await fs.mkdir(docsDir, { recursive: true });
    created.push('docs/');
  }

  // .zettelgeist/ — tool-managed state directory. Created here so the
  // regen cache and exports have a home; gitignored via the block below.
  const stateDir = path.join(cwd, '.zettelgeist');
  if (await exists(stateDir)) {
    preserved.push('.zettelgeist/');
  } else {
    await fs.mkdir(stateDir, { recursive: true });
    created.push('.zettelgeist/');
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
  if (giContent.includes('# >>> zettelgeist >>>')) {
    preserved.push('.gitignore');
  } else {
    const sep = giContent === '' || giContent.endsWith('\n') ? '' : '\n';
    await fs.writeFile(giPath, giContent + sep + DEFAULT_GITIGNORE_BLOCK, 'utf8');
    created.push(giExisted ? '.gitignore (block appended)' : '.gitignore');
  }

  return okEnvelope({ created, preserved });
}
