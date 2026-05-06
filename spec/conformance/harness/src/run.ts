import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { FsReader } from '@zettelgeist/core';

export function makeDiskFsReader(rootDir: string): FsReader {
  const resolve = (p: string) => path.join(rootDir, p);
  return {
    async readDir(p) {
      const entries = await fs.readdir(resolve(p), { withFileTypes: true });
      return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
    },
    async readFile(p) {
      return fs.readFile(resolve(p), 'utf8');
    },
    async exists(p) {
      try {
        await fs.stat(resolve(p));
        return true;
      } catch {
        return false;
      }
    },
  };
}
