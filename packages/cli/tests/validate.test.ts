import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateCommand } from '../src/commands/validate.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-validate-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('validateCommand', () => {
  it('ok with empty errors for a healthy repo', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# Foo\n');
    const r = await validateCommand({ path: tmp });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.errors).toEqual([]);
  });

  it('error envelope listing validation errors', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'a'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'specs', 'b'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'a', 'requirements.md'), '---\ndepends_on: [b]\n---\n');
    await fs.writeFile(path.join(tmp, 'specs', 'b', 'requirements.md'), '---\ndepends_on: [a]\n---\n');
    const r = await validateCommand({ path: tmp });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const detail = r.error.detail as { errors: Array<{ code: string }> };
      expect(detail.errors.some((e) => e.code === 'E_CYCLE')).toBe(true);
    }
  });

  it('returns error for non-repo', async () => {
    await fs.unlink(path.join(tmp, '.zettelgeist.yaml'));
    const r = await validateCommand({ path: tmp });
    expect(r.ok).toBe(false);
  });
});
