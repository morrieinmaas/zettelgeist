import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { installSkillCommand } from '../src/commands/install-skill.js';

let cwd: string;
let homeDir: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-skill-cwd-'));
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-skill-home-'));
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe('installSkillCommand', () => {
  it('writes the skill to ~/.claude/skills/zettelgeist/SKILL.md (user scope)', async () => {
    const r = await installSkillCommand({ cwd, scope: 'user', force: false, homeDir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.path).toBe(path.join(homeDir, '.claude', 'skills', 'zettelgeist', 'SKILL.md'));
    const content = await fs.readFile(r.data.path, 'utf8');
    expect(content).toContain('name: zettelgeist');
    expect(content).toContain('claim_spec');
  });

  it('writes the skill to .claude/skills/zettelgeist/SKILL.md (project scope)', async () => {
    const r = await installSkillCommand({ cwd, scope: 'project', force: false, homeDir });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.path).toBe(path.join(cwd, '.claude', 'skills', 'zettelgeist', 'SKILL.md'));
  });

  it('refuses to overwrite without --force', async () => {
    const first = await installSkillCommand({ cwd, scope: 'user', force: false, homeDir });
    expect(first.ok).toBe(true);
    const second = await installSkillCommand({ cwd, scope: 'user', force: false, homeDir });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.message).toMatch(/already exists/);
  });

  it('overwrites with --force', async () => {
    await installSkillCommand({ cwd, scope: 'user', force: false, homeDir });
    const dest = path.join(homeDir, '.claude', 'skills', 'zettelgeist', 'SKILL.md');
    await fs.writeFile(dest, 'modified\n');
    const r = await installSkillCommand({ cwd, scope: 'user', force: true, homeDir });
    expect(r.ok).toBe(true);
    const content = await fs.readFile(dest, 'utf8');
    expect(content).toContain('name: zettelgeist');
    expect(content).not.toBe('modified\n');
  });

  it('creates the destination directory hierarchy if missing', async () => {
    const r = await installSkillCommand({ cwd, scope: 'user', force: false, homeDir });
    expect(r.ok).toBe(true);
    const stat = await fs.stat(path.join(homeDir, '.claude', 'skills', 'zettelgeist'));
    expect(stat.isDirectory()).toBe(true);
  });

  describe('agents-md scope', () => {
    it('writes a fresh AGENTS.md when none exists', async () => {
      const r = await installSkillCommand({ cwd, scope: 'agents-md', force: false, homeDir });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.path).toBe(path.join(cwd, 'AGENTS.md'));
      const content = await fs.readFile(r.data.path, 'utf8');
      expect(content).toContain('ZETTELGEIST:SKILL-BEGIN');
      expect(content).toContain('ZETTELGEIST:SKILL-END');
      // YAML frontmatter MUST be stripped — AGENTS.md is plain markdown
      expect(content).not.toMatch(/^---\n/);
      expect(content).toContain('Zettelgeist agent workflow');
    });

    it('appends to an existing AGENTS.md without markers', async () => {
      const dest = path.join(cwd, 'AGENTS.md');
      await fs.writeFile(dest, '# My project\n\nOther agent guidance here.\n');
      const r = await installSkillCommand({ cwd, scope: 'agents-md', force: false, homeDir });
      expect(r.ok).toBe(true);
      const content = await fs.readFile(dest, 'utf8');
      // Pre-existing content preserved
      expect(content).toContain('# My project');
      expect(content).toContain('Other agent guidance here.');
      // Skill region appended
      expect(content).toContain('ZETTELGEIST:SKILL-BEGIN');
      expect(content).toContain('Zettelgeist agent workflow');
    });

    it('replaces only the marker region on re-run, preserving surrounding content', async () => {
      const dest = path.join(cwd, 'AGENTS.md');
      const initial =
        '# Project rules\n\n' +
        'Rule 1: Be careful.\n\n' +
        '<!-- ZETTELGEIST:SKILL-BEGIN — managed by `zettelgeist install-skill` -->\n\n' +
        'OLD SKILL CONTENT THAT SHOULD BE REPLACED\n\n' +
        '<!-- ZETTELGEIST:SKILL-END -->\n\n' +
        '## Other house rules\n\nDon\'t commit secrets.\n';
      await fs.writeFile(dest, initial);

      const r = await installSkillCommand({ cwd, scope: 'agents-md', force: false, homeDir });
      expect(r.ok).toBe(true);
      const content = await fs.readFile(dest, 'utf8');
      expect(content).toContain('# Project rules');
      expect(content).toContain('Rule 1: Be careful.');
      expect(content).toContain('## Other house rules');
      expect(content).toContain("Don't commit secrets.");
      expect(content).not.toContain('OLD SKILL CONTENT');
      expect(content).toContain('Zettelgeist agent workflow');
    });

    it('errors on malformed marker pair (begin without end)', async () => {
      const dest = path.join(cwd, 'AGENTS.md');
      await fs.writeFile(
        dest,
        'Body\n<!-- ZETTELGEIST:SKILL-BEGIN — managed by `zettelgeist install-skill` -->\nleftover\n',
      );
      const r = await installSkillCommand({ cwd, scope: 'agents-md', force: false, homeDir });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.message).toMatch(/malformed/i);
    });
  });
});
