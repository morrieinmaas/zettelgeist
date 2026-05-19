import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { initCommand } from '../src/commands/init.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-init-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

describe('initCommand — fresh directory', () => {
  it('creates .zettelgeist.yaml + specs/ + docs/ + .zettelgeist/ + .gitignore block', async () => {
    const r = await initCommand({ path: tmp, force: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.created).toContain('.zettelgeist.yaml');
    expect(r.data.created).toContain('specs/');
    expect(r.data.created).toContain('docs/');
    expect(r.data.created).toContain('.zettelgeist/');
    expect(await exists(path.join(tmp, '.zettelgeist.yaml'))).toBe(true);
    expect(await exists(path.join(tmp, 'specs'))).toBe(true);
    expect(await exists(path.join(tmp, 'docs'))).toBe(true);
    expect(await exists(path.join(tmp, '.zettelgeist'))).toBe(true);
    const gi = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(gi).toContain('# >>> zettelgeist >>>');
    expect(gi).toContain('# <<< zettelgeist <<<');
    expect(gi).toContain('.zettelgeist/regen-cache.json');
    expect(gi).toContain('specs/*/.claim-*');
  });

  it('writes a valid yaml that loadConfig can parse', async () => {
    await initCommand({ path: tmp, force: false });
    const content = await fs.readFile(path.join(tmp, '.zettelgeist.yaml'), 'utf8');
    expect(content).toMatch(/format_version:\s*"0\.1"/);
  });
});

describe('initCommand — idempotency and conflict detection', () => {
  it('refuses to overwrite an existing .zettelgeist.yaml without --force', async () => {
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n# my customisation\n');
    const r = await initCommand({ path: tmp, force: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/already exists.*--force/);
    // Existing content must be untouched.
    const content = await fs.readFile(path.join(tmp, '.zettelgeist.yaml'), 'utf8');
    expect(content).toContain('# my customisation');
  });

  it('with --force overwrites .zettelgeist.yaml but preserves existing specs/ + docs/ dirs', async () => {
    await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.0"\n');
    await fs.mkdir(path.join(tmp, 'specs', 'pre-existing'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'pre-existing', 'requirements.md'), '# was here\n');

    const r = await initCommand({ path: tmp, force: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.preserved).toContain('specs/');
    // The pre-existing spec must NOT have been clobbered.
    expect(await exists(path.join(tmp, 'specs', 'pre-existing', 'requirements.md'))).toBe(true);
    // .zettelgeist.yaml was overwritten with the default.
    const content = await fs.readFile(path.join(tmp, '.zettelgeist.yaml'), 'utf8');
    expect(content).toMatch(/format_version:\s*"0\.1"/);
  });

  it('appends the gitignore block exactly once when re-run with --force', async () => {
    await fs.writeFile(path.join(tmp, '.gitignore'), '# user content\nnode_modules/\n');
    await initCommand({ path: tmp, force: false });
    const first = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    // Re-run with --force: gitignore should NOT get a duplicate block.
    await initCommand({ path: tmp, force: true });
    const second = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(second).toBe(first);
    expect(second.match(/# >>> zettelgeist >>>/g)).toHaveLength(1);
    // The user's pre-existing content must still be there.
    expect(second).toContain('# user content');
    expect(second).toContain('node_modules/');
  });

  it('preserves a non-empty .gitignore correctly when prefixing the block', async () => {
    // No trailing newline edge case — make sure we don't run lines together.
    await fs.writeFile(path.join(tmp, '.gitignore'), 'foo.txt');
    await initCommand({ path: tmp, force: false });
    const gi = await fs.readFile(path.join(tmp, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^foo\.txt\n# >>> zettelgeist >>>/m);
  });
});
