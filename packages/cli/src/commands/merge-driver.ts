import { promises as fs } from 'node:fs';
import { mergeTasksMd, mergeFrontmatter } from '@zettelgeist/core';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist merge-driver <kind> <base> <ours> <theirs> [--json]

  Resolve a git merge conflict for a Zettelgeist-managed file. Invoked
  automatically by git when the corresponding driver is configured (set up
  by \`zettelgeist install-hook\`).

  Kinds:
    tasks         \`specs/*/tasks.md\`. Three-way merge that matches tasks by
                  text identity. Per-task: either side checked wins; both
                  un-checked from a checked base un-checks; tags union;
                  renamed tasks appear as two entries. Prose preserved from
                  \`ours\`.
    frontmatter   \`specs/*/requirements.md\`. Splits each side into
                  (YAML block, body); merges the YAML field-by-field
                  (status with conflict marker if divergent; lists union;
                  scalars with conflict marker if both non-empty differ);
                  body is text-merged.

  Note: \`specs/INDEX.md\` is NOT handled by a custom driver. It uses
  \`merge=union\` plus the \`post-merge\` hook installed by \`install-hook\`
  to regenerate after the merge completes.

  Arguments mirror git's %O/%A/%B placeholders:
    base     temp file with the common-ancestor version (may be absent)
    ours     temp file with our version — the driver WRITES the resolution here
    theirs   temp file with their version (read-only)

  Flags:
    --json   Emit a JSON envelope on stdout (useful for tests).
`;

export type MergeDriverKind = 'tasks' | 'frontmatter';
const KINDS: ReadonlySet<MergeDriverKind> = new Set(['tasks', 'frontmatter']);

export function isMergeDriverKind(s: string): s is MergeDriverKind {
  return KINDS.has(s as MergeDriverKind);
}

export interface MergeDriverInput {
  kind: MergeDriverKind;
  basePath: string;
  oursPath: string;
  theirsPath: string;
}

export interface MergeDriverOk {
  kind: MergeDriverKind;
  /**
   * True iff the merge produced no conflict markers. When false, the
   * driver wrote a file containing `<<<<<<<` markers and the CLI exits
   * non-zero so git records the file as conflicted (per git's merge-driver
   * contract: exit 0 = clean, non-zero = conflict).
   */
  cleanlyResolved: boolean;
  outputPath: string;
}

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return '';
    throw err;
  }
}

export async function mergeDriverCommand(
  input: MergeDriverInput,
): Promise<Envelope<MergeDriverOk>> {
  const [base, ours, theirs] = await Promise.all([
    readOrEmpty(input.basePath),
    readOrEmpty(input.oursPath),
    readOrEmpty(input.theirsPath),
  ]);
  let result: { content: string; ok: boolean };
  if (input.kind === 'tasks') {
    result = mergeTasksMd(base, ours, theirs);
  } else if (input.kind === 'frontmatter') {
    result = mergeFrontmatter(base, ours, theirs);
  } else {
    return errorEnvelope(`unknown merge driver kind: ${input.kind}`);
  }
  try {
    await fs.writeFile(input.oursPath, result.content, 'utf8');
  } catch (err) {
    return errorEnvelope(
      `merge-driver: cannot write resolution to ${input.oursPath}: ${(err as Error).message}`,
    );
  }
  return okEnvelope({
    kind: input.kind,
    cleanlyResolved: result.ok,
    outputPath: input.oursPath,
  });
}
