import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist install-skill [--scope user|project|agents-md] [--force] [--json]

  Install the Zettelgeist agent skill so coding agents pick it up
  automatically when working in this repo.

  Scopes:
    user        ~/.claude/skills/zettelgeist/SKILL.md
                Claude Code (CLI + VS Code), global. Default.
    project     <cwd>/.claude/skills/zettelgeist/SKILL.md
                Claude Code, per-repo. Commit this for the whole team.
    agents-md   <cwd>/AGENTS.md
                Cross-tool convention read by Codex, Copilot CLI, and
                Claude Code as a fallback. Smart-merge: if AGENTS.md
                exists, only the region between
                  <!-- ZETTELGEIST:SKILL-BEGIN -->
                  <!-- ZETTELGEIST:SKILL-END -->
                is replaced; anything else is preserved.

  Flags:
    --scope SCOPE  Where to install. Defaults to "user".
    --force        For user/project: overwrite an existing SKILL.md.
                   For agents-md: recover from a malformed marker pair
                   (strip the orphan markers and append a clean region).
                   Normal smart-merges happen without --force.
    --json         Emit a machine-readable JSON envelope.

  The skill is a workflow guide: claim → read → mutate → handoff →
  release, plus the v0.1 format rules an agent will otherwise
  rediscover by trial and error.
`;

export type Scope = 'user' | 'project' | 'agents-md';

const SCOPES: ReadonlySet<Scope> = new Set(['user', 'project', 'agents-md']);

export function isScope(s: string): s is Scope {
  return SCOPES.has(s as Scope);
}

export interface InstallSkillInput {
  cwd: string;
  scope: Scope;
  force: boolean;
  /** Override the home dir resolver — used by tests. */
  homeDir?: string;
}

export interface InstallSkillOk {
  installed: true;
  path: string;
  scope: Scope;
  /** True if a pre-existing file/region was merged into rather than overwritten. */
  merged?: boolean;
}

const AGENTS_BEGIN = '<!-- ZETTELGEIST:SKILL-BEGIN — managed by `zettelgeist install-skill` -->';
const AGENTS_END = '<!-- ZETTELGEIST:SKILL-END -->';

/**
 * Resolve the bundled SKILL.md path, trying:
 *   1. dist/templates/skill/SKILL.md  (npm-installed location)
 *   2. ../templates/skill/SKILL.md    (dev, running dist/bin.js inside the workspace)
 *   3. ../../templates/skill/SKILL.md (tests, running src/ via vitest)
 */
async function locateBundledSkill(): Promise<string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'templates', 'skill', 'SKILL.md'),
    path.join(here, '..', 'templates', 'skill', 'SKILL.md'),
    path.join(here, '..', '..', 'templates', 'skill', 'SKILL.md'),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error('bundled SKILL.md not found — reinstall @zettelgeist/cli');
}

function resolveDest(input: InstallSkillInput): string {
  if (input.scope === 'user') {
    return path.join(
      input.homeDir ?? os.homedir(),
      '.claude', 'skills', 'zettelgeist', 'SKILL.md',
    );
  }
  if (input.scope === 'project') {
    return path.join(input.cwd, '.claude', 'skills', 'zettelgeist', 'SKILL.md');
  }
  // agents-md
  return path.join(input.cwd, 'AGENTS.md');
}

/**
 * Strip the YAML frontmatter (`---\n...\n---\n`) from a SKILL.md so the body
 * can be embedded into AGENTS.md (which is plain markdown). If the input does
 * not start with `---\n` or has no closing delimiter, returns the input
 * unchanged — callers should pass a well-formed SKILL.md.
 *
 * Exported for direct test coverage.
 */
export function stripFrontmatter(skill: string): string {
  if (!skill.startsWith('---\n')) return skill;
  const end = skill.indexOf('\n---\n', 4);
  if (end === -1) return skill;
  return skill.slice(end + 5).replace(/^\n+/, '');
}

function renderAgentsRegion(skillBody: string): string {
  return `${AGENTS_BEGIN}\n\n${skillBody.trimEnd()}\n\n${AGENTS_END}`;
}

/**
 * Merge the skill region into an existing AGENTS.md.
 * - If both markers are present, replace the region between them.
 * - If neither marker is present, append.
 * - If only one marker is present (or they're in the wrong order), fail
 *   unless `force` is true, in which case strip the orphan marker and
 *   append a clean region.
 */
function mergeAgentsMd(
  existing: string,
  skillBody: string,
  force: boolean,
): { content: string; merged: boolean } {
  const begin = existing.indexOf(AGENTS_BEGIN);
  const end = existing.indexOf(AGENTS_END);
  if (begin === -1 && end === -1) {
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    return { content: `${existing}${sep}${renderAgentsRegion(skillBody)}\n`, merged: true };
  }
  if (begin === -1 || end === -1 || end < begin) {
    if (!force) {
      throw new Error(
        'AGENTS.md has a malformed ZETTELGEIST marker pair — fix manually or re-run with --force to recover',
      );
    }
    // Strip both markers wherever they appear and append a clean region.
    let stripped = existing
      .split('\n')
      .filter((line) => !line.includes(AGENTS_BEGIN) && !line.includes(AGENTS_END))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\n+$/, '');
    if (stripped.length === 0) stripped = '';
    const sep = stripped.length === 0 ? '' : '\n\n';
    return { content: `${stripped}${sep}${renderAgentsRegion(skillBody)}\n`, merged: true };
  }
  const before = existing.slice(0, begin).replace(/\n+$/, '');
  const after = existing.slice(end + AGENTS_END.length).replace(/^\n+/, '');
  const middle = renderAgentsRegion(skillBody);
  const joined = [before, middle, after].filter((s) => s.length > 0).join('\n\n');
  return { content: `${joined}\n`, merged: true };
}

export async function installSkillCommand(
  input: InstallSkillInput,
): Promise<Envelope<InstallSkillOk>> {
  let source: string;
  try {
    source = await locateBundledSkill();
  } catch (err) {
    return errorEnvelope(err instanceof Error ? err.message : String(err));
  }

  let skill: string;
  try {
    skill = await fs.readFile(source, 'utf8');
  } catch (err) {
    return errorEnvelope(err instanceof Error ? err.message : String(err));
  }

  const dest = resolveDest(input);

  if (input.scope === 'agents-md') {
    let existing: string | null = null;
    try {
      existing = await fs.readFile(dest, 'utf8');
    } catch {
      /* file doesn't exist — write fresh */
    }
    const body = stripFrontmatter(skill);
    try {
      if (existing === null) {
        await fs.writeFile(dest, `${renderAgentsRegion(body)}\n`, 'utf8');
        return okEnvelope({ installed: true, path: dest, scope: input.scope });
      }
      const merged = mergeAgentsMd(existing, body, input.force);
      await fs.writeFile(dest, merged.content, 'utf8');
      return okEnvelope({ installed: true, path: dest, scope: input.scope, merged: merged.merged });
    } catch (err) {
      return errorEnvelope(err instanceof Error ? err.message : String(err));
    }
  }

  // user / project: file-replace, refuse to overwrite without --force
  try {
    await fs.access(dest);
    if (!input.force) {
      return errorEnvelope(`${dest} already exists. Re-run with --force to overwrite.`);
    }
  } catch {
    /* destination does not exist — proceed */
  }

  try {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, skill, 'utf8');
  } catch (err) {
    return errorEnvelope(err instanceof Error ? err.message : String(err));
  }

  return okEnvelope({ installed: true, path: dest, scope: input.scope });
}
