import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeDiskFsReader } from '../src/disk.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-fs-adapters-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('makeDiskFsReader', () => {
  it('readDir lists files and directories', async () => {
    await fs.mkdir(path.join(tmp, 'sub'));
    await fs.writeFile(path.join(tmp, 'a.txt'), 'a');
    await fs.writeFile(path.join(tmp, 'sub', 'b.txt'), 'b');
    const reader = makeDiskFsReader(tmp);

    const root = await reader.readDir('');
    const sortedRoot = root.map((e) => `${e.name}:${e.isDir}`).sort();
    expect(sortedRoot).toEqual(['a.txt:false', 'sub:true']);

    const sub = await reader.readDir('sub');
    expect(sub).toEqual([{ name: 'b.txt', isDir: false }]);
  });

  it('readFile returns UTF-8 contents', async () => {
    await fs.writeFile(path.join(tmp, 'foo.txt'), 'hello — world\n');
    const reader = makeDiskFsReader(tmp);
    expect(await reader.readFile('foo.txt')).toBe('hello — world\n');
  });

  it('readFile rejects for missing paths', async () => {
    const reader = makeDiskFsReader(tmp);
    await expect(reader.readFile('nope.txt')).rejects.toBeDefined();
  });

  it('exists returns true for files and directories', async () => {
    await fs.mkdir(path.join(tmp, 'sub'));
    await fs.writeFile(path.join(tmp, 'a.txt'), 'a');
    const reader = makeDiskFsReader(tmp);
    expect(await reader.exists('a.txt')).toBe(true);
    expect(await reader.exists('sub')).toBe(true);
  });

  it('exists returns false for missing paths', async () => {
    const reader = makeDiskFsReader(tmp);
    expect(await reader.exists('missing')).toBe(false);
  });
});
