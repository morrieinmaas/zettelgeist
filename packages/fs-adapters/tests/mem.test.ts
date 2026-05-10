import { describe, expect, it } from 'vitest';
import { makeMemFsReader } from '../src/mem.js';

describe('makeMemFsReader', () => {
  it('readDir on root returns top-level entries', async () => {
    const fs = makeMemFsReader({
      'a/b.txt': '',
      'a/c.txt': '',
      'd.txt': '',
    });
    const entries = await fs.readDir('');
    const sorted = entries.map((e) => `${e.name}:${e.isDir}`).sort();
    expect(sorted).toEqual(['a:true', 'd.txt:false']);
  });

  it('readDir on a nested path returns its children', async () => {
    const fs = makeMemFsReader({
      'a/b/c.txt': '',
      'a/d.txt': '',
    });
    const entries = await fs.readDir('a');
    const sorted = entries.map((e) => `${e.name}:${e.isDir}`).sort();
    expect(sorted).toEqual(['b:true', 'd.txt:false']);
  });

  it('readFile returns the stored content', async () => {
    const fs = makeMemFsReader({ 'foo.txt': 'hello\n' });
    expect(await fs.readFile('foo.txt')).toBe('hello\n');
  });

  it('readFile throws for missing paths', async () => {
    const fs = makeMemFsReader({});
    await expect(fs.readFile('missing.txt')).rejects.toThrow(/ENOENT|missing.txt/);
  });

  it('exists returns true for a file', async () => {
    const fs = makeMemFsReader({ 'foo.txt': '' });
    expect(await fs.exists('foo.txt')).toBe(true);
  });

  it('exists returns true for a directory inferred from a child path', async () => {
    const fs = makeMemFsReader({ 'a/b.txt': '' });
    expect(await fs.exists('a')).toBe(true);
  });

  it('exists returns false for missing paths', async () => {
    const fs = makeMemFsReader({});
    expect(await fs.exists('missing')).toBe(false);
  });
});
