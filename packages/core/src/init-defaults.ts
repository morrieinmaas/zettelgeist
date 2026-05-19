/**
 * Single source of truth for `zettelgeist init`-style scaffolding.
 *
 * Both surfaces (the CLI `init` command and the VSCode extension's
 * "Initialize Workspace" command) materialize the same files when a
 * user onboards onto a new repo. To prevent silent drift between those
 * two implementations, the *content* lives here and the *fs writes*
 * live in each surface. That keeps the platform-specific bits
 * (node:fs/promises in CLI vs. VSCode's idiomatic node:fs) local while
 * guaranteeing the produced files are byte-identical.
 */

/**
 * The default `.zettelgeist.yaml` content emitted on a fresh init.
 * Implementations MUST NOT alter `format_version`; the commented
 * `specs_dir:` line is a hint for users who want to override the
 * default directory.
 */
export const DEFAULT_CONFIG = `format_version: "0.1"
# specs_dir: specs            # uncomment to override
`;

/**
 * Stable marker that identifies our managed gitignore block.
 * Implementations check for this substring before appending to detect
 * "already installed" idempotently.
 */
export const GITIGNORE_MARKER_BEGIN = '# >>> zettelgeist >>>';
export const GITIGNORE_MARKER_END = '# <<< zettelgeist <<<';

/**
 * The block we append to (or create) `.gitignore` on init. Gitignores
 * tool-managed state and per-actor claim files.
 *
 * The marker pair MUST match the constants above so consumers can
 * detect / replace the block deterministically.
 */
export const DEFAULT_GITIGNORE_BLOCK = `${GITIGNORE_MARKER_BEGIN}
# Tool-managed state (regen cache, exported HTML, etc.).
.zettelgeist/regen-cache.json
.zettelgeist/exports/
# Per-actor claim files (v0.2 distributed-conflict design).
specs/*/.claim
specs/*/.claim-*
${GITIGNORE_MARKER_END}
`;

/**
 * Directories created on init (relative to the workspace root). The
 * three roles:
 *
 *  - `specs/`        — where spec folders live (each one a kebab-case
 *                      subdir holding `requirements.md` etc.).
 *  - `docs/`         — optional non-spec markdown (architecture notes,
 *                      ADRs, etc.). Surfaced by `zettelgeist serve`.
 *  - `.zettelgeist/` — tool-managed state directory. Contains the
 *                      regen cache and exports; gitignored by the
 *                      block above.
 */
export const INIT_DIRS = ['specs', 'docs', '.zettelgeist'] as const;

/**
 * Decide what the new `.gitignore` content should be given the
 * (possibly empty) existing content. Pure function — no I/O. Returns
 * `null` when the marker is already present (no change needed); the
 * caller skips the write.
 */
export function gitignoreWithMarkerBlock(existing: string): string | null {
  if (existing.includes(GITIGNORE_MARKER_BEGIN)) return null;
  const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
  return existing + sep + DEFAULT_GITIGNORE_BLOCK;
}
