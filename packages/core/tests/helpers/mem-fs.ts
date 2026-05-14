import type { FsReader } from '../../src/index.js';

/**
 * In-memory FsReader for tests in this package only. Kept inline (rather than
 * imported from @zettelgeist/fs-adapters) to avoid a workspace dependency
 * cycle: fs-adapters depends on core for the FsReader type, and core's tests
 * used to depend on fs-adapters for this helper. The cycle made pnpm unable
 * to topologically order builds, which broke CI when core/dist/ wasn't yet
 * written by the time fs-adapters' tsc build started.
 *
 * The real `makeMemFsReader` in @zettelgeist/fs-adapters is identical.
 */
export function makeMemFsReader(files: Record<string, string>): FsReader {
  const dirs = new Set<string>();
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }
  return {
    async readDir(path) {
      const prefix = path === '' ? '' : `${path}/`;
      const seen = new Set<string>();
      const out: Array<{ name: string; isDir: boolean }> = [];
      for (const f of Object.keys(files)) {
        if (!f.startsWith(prefix)) continue;
        const rest = f.slice(prefix.length);
        const head = rest.split('/')[0];
        if (!head || seen.has(head)) continue;
        seen.add(head);
        const fullChild = prefix + head;
        out.push({ name: head, isDir: dirs.has(fullChild) });
      }
      return out;
    },
    async readFile(path) {
      const v = files[path];
      if (v === undefined) throw new Error(`ENOENT: ${path}`);
      return v;
    },
    async exists(path) {
      return path in files || dirs.has(path);
    },
  };
}
