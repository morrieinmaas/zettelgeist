import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

/**
 * The Zettelgeist agent skill — workflow guide for using the MCP server.
 * Canonical source: packages/cli/templates/skill/SKILL.md
 *
 * The build script copies SKILL.md next to bin.js in dist/ so the bundled
 * binary needs no companion paths to resolve. In development (tests), we
 * fall back to the workspace-relative path.
 */
function loadSkill(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'SKILL.md'),                                              // dist/SKILL.md (after `pnpm build`)
    path.join(here, '..', '..', 'cli', 'templates', 'skill', 'SKILL.md'),      // src/ workspace dev
  ];
  for (const c of candidates) {
    try {
      return readFileSync(c, 'utf8');
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'SKILL.md not found — bundled file is missing from dist/. Reinstall @zettelgeist/mcp-server.',
  );
}

export const SKILL_MD: string = loadSkill();

/**
 * Strip the YAML frontmatter so the body can be embedded in MCP prompt
 * messages. The frontmatter is Claude Code skill metadata, not part of
 * the user-facing content.
 */
export function skillBody(): string {
  if (!SKILL_MD.startsWith('---\n')) return SKILL_MD;
  const end = SKILL_MD.indexOf('\n---\n', 4);
  if (end === -1) return SKILL_MD;
  return SKILL_MD.slice(end + 5).replace(/^\n+/, '');
}
