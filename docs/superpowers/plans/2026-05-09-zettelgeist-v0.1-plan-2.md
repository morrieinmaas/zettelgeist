# Zettelgeist v0.1 — Plan 2: MCP Server + CLI + Hook + CI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two surface artifacts that turn Plan 1's format core into something users actually run: a Node CLI (`zettelgeist`) and a stdio MCP server (`zettelgeist-mcp`). Plus a pre-commit hook installer, GitHub Actions CI workflow, husky template, and an agent-readable `SKILL.md` manifest.

**Architecture:** Three new pnpm-workspace packages. `packages/fs-adapters/` extracts the shared disk-and-memory `FsReader` implementations (currently duplicated in core's tests and the conformance harness). `packages/cli/` provides `zettelgeist` — uses Node's built-in `parseArgs` plus a small subcommand router; no external CLI library. `packages/mcp-server/` provides `zettelgeist-mcp` — uses `@modelcontextprotocol/sdk` with stdio transport. All three depend on `@zettelgeist/core`. The `zettelgeist serve` command exists as a stub in this plan; the actual viewer ships in Plan 2.5.

**Tech Stack:**
- TypeScript 5.x (strict, NodeNext, ES2022) — same as Plan 1
- pnpm 9.x workspaces
- Vitest (test runner)
- `@modelcontextprotocol/sdk` (latest stable; pin via package.json)
- `zod` (peer of MCP SDK; explicit dep for clarity)
- Node 20+ (`util.parseArgs`, `node:child_process`, `node:http`, `node:fs/promises`)

**Out of scope for this plan:** VSCode extension (Plans 3–4); HTTP/SSE MCP transports; `zettelgeist repl`; agent loop orchestration; events/webhooks; suggestion-branch flow; the actual viewer (Plan 2.5).

---

## Phase 1 — `packages/fs-adapters/` (Tasks 1–4)

The shared filesystem adapter package. Extracts code currently duplicated in `packages/core/tests/loader.test.ts`, `packages/core/tests/validate.test.ts`, and `spec/conformance/harness/src/run.ts`. Lands first because everything else depends on it.

### Task 1: fs-adapters package skeleton

**Files:**
- Create: `packages/fs-adapters/package.json`
- Create: `packages/fs-adapters/tsconfig.json`
- Create: `packages/fs-adapters/tsconfig.build.json`
- Create: `packages/fs-adapters/src/index.ts`

- [ ] **Step 1: Create `packages/fs-adapters/package.json`**

```json
{
  "name": "@zettelgeist/fs-adapters",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@zettelgeist/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/fs-adapters/tsconfig.json`** (mirrors core's pattern):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/fs-adapters/tsconfig.build.json`**:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/fs-adapters/src/index.ts`** (placeholder; tasks 2–3 fill it):

```ts
export { makeMemFsReader } from './mem.js';
export { makeDiskFsReader } from './disk.js';
```

- [ ] **Step 5: Install + typecheck**

Run: `pnpm install && pnpm --filter @zettelgeist/fs-adapters typecheck`
Expected: typecheck fails (mem.js and disk.js don't exist yet). That's expected; Tasks 2–3 add them.

- [ ] **Step 6: Commit (skeleton only — no working tests yet, leave for Task 2)**

```bash
git add packages/fs-adapters pnpm-lock.yaml
git commit -m "chore(fs-adapters): scaffold package"
```

---

### Task 2: `makeMemFsReader` implementation + tests

**Files:**
- Create: `packages/fs-adapters/src/mem.ts`
- Create: `packages/fs-adapters/tests/mem.test.ts`

The implementation is extracted verbatim from the duplicate `makeMemFs` helper in `packages/core/tests/loader.test.ts:4-37` (and the near-identical copy in `validate.test.ts`). Generalize the param name and add proper types.

- [ ] **Step 1: Write failing tests**

`packages/fs-adapters/tests/mem.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @zettelgeist/fs-adapters test`
Expected: failures (`mem.js` doesn't exist).

- [ ] **Step 3: Implement `mem.ts`**

`packages/fs-adapters/src/mem.ts`:

```ts
import type { FsReader } from '@zettelgeist/core';

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
```

- [ ] **Step 4: Re-export from `packages/fs-adapters/src/index.ts`**

Already wired in Task 1. Verify:

```ts
export { makeMemFsReader } from './mem.js';
export { makeDiskFsReader } from './disk.js';   // disk.ts coming in Task 3
```

The disk import line is dead until Task 3, but TS won't error on a missing module unless something imports `makeDiskFsReader`. If TS does complain, change Task 4 of Task 1 to comment-out the disk line and uncomment in Task 3.

- [ ] **Step 5: Run tests — expect pass**

Run: `pnpm --filter @zettelgeist/fs-adapters test`
Expected: all 7 tests pass (only mem; disk tests are in Task 3).

If TypeScript errors on `makeDiskFsReader` import in `index.ts`, comment out that line for now; Task 3 restores it.

- [ ] **Step 6: Commit**

```bash
git add packages/fs-adapters
git commit -m "feat(fs-adapters): in-memory FsReader extracted from test helpers"
```

---

### Task 3: `makeDiskFsReader` implementation + tests

**Files:**
- Create: `packages/fs-adapters/src/disk.ts`
- Create: `packages/fs-adapters/tests/disk.test.ts`

Extracted verbatim from `spec/conformance/harness/src/run.ts:6-22`.

- [ ] **Step 1: Write failing tests**

`packages/fs-adapters/tests/disk.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --filter @zettelgeist/fs-adapters test disk`
Expected: failures.

- [ ] **Step 3: Implement `disk.ts`**

`packages/fs-adapters/src/disk.ts`:

```ts
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
```

If you commented out the `makeDiskFsReader` re-export in Task 2's Step 4, restore it now.

- [ ] **Step 4: Run all fs-adapters tests — expect pass**

Run: `pnpm --filter @zettelgeist/fs-adapters test`
Expected: 7 mem + 5 disk = 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/fs-adapters
git commit -m "feat(fs-adapters): disk FsReader against tmpdir"
```

---

### Task 4: Migrate consumers to shared `@zettelgeist/fs-adapters`

Three consumers currently duplicate the FsReader implementations:
1. `packages/core/tests/loader.test.ts` — has its own `makeMemFs`
2. `packages/core/tests/validate.test.ts` — has its own near-identical copy
3. `spec/conformance/harness/src/run.ts` — has its own disk FsReader

Replace each with an import from `@zettelgeist/fs-adapters`.

**Files modified:**
- Modify: `packages/core/package.json` — add devDep on `@zettelgeist/fs-adapters`
- Modify: `packages/core/tests/loader.test.ts` — remove local `makeMemFs`, import shared one
- Modify: `packages/core/tests/validate.test.ts` — same
- Modify: `spec/conformance/harness/package.json` — add devDep on `@zettelgeist/fs-adapters`
- Modify: `spec/conformance/harness/src/run.ts` — re-export from shared
- Modify: `spec/conformance/harness/vitest.config.ts` — add alias for `@zettelgeist/fs-adapters` if needed

- [ ] **Step 1: Add devDep to core**

In `packages/core/package.json`, add to `devDependencies` (creating the field if missing):

```json
"devDependencies": {
  "@zettelgeist/fs-adapters": "workspace:*"
}
```

- [ ] **Step 2: Update `packages/core/tests/loader.test.ts`**

Replace the local `makeMemFs` function (the entire block from import through the function body, ~30 lines) with:

```ts
import { makeMemFsReader as makeMemFs } from '@zettelgeist/fs-adapters';
```

(Keep the alias name `makeMemFs` so the test bodies don't change.)

Verify all tests still pass:

```
pnpm --filter @zettelgeist/core test loader
```
Expected: 6 tests pass.

- [ ] **Step 3: Update `packages/core/tests/validate.test.ts`**

Same change — remove the local `makeMemFs`, import from shared package.

```
pnpm --filter @zettelgeist/core test validate
```
Expected: 4 tests pass.

- [ ] **Step 4: Add devDep to harness**

In `spec/conformance/harness/package.json`, add to `dependencies`:

```json
"dependencies": {
  "@zettelgeist/core": "workspace:*",
  "@zettelgeist/fs-adapters": "workspace:*"
}
```

- [ ] **Step 5: Update `spec/conformance/harness/src/run.ts`**

Replace the file content with a thin re-export:

```ts
export { makeDiskFsReader } from '@zettelgeist/fs-adapters';
```

(The harness test imports `makeDiskFsReader` from `../src/run.js` — that import keeps working.)

- [ ] **Step 6: Update harness's `vitest.config.ts` if needed**

The vitest config already aliases `@zettelgeist/core` to its source. Add an alias for `@zettelgeist/fs-adapters` to source as well, so the harness runs without requiring a build:

`spec/conformance/harness/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@zettelgeist/core': path.resolve(here, '../../../packages/core/src/index.ts'),
      '@zettelgeist/fs-adapters': path.resolve(here, '../../../packages/fs-adapters/src/index.ts'),
    },
  },
});
```

Also update `spec/conformance/harness/tsconfig.json` to add a path mapping (mirroring the existing core one):

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@zettelgeist/core": ["../../../packages/core/src/index.ts"],
      "@zettelgeist/fs-adapters": ["../../../packages/fs-adapters/src/index.ts"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "vitest.config.ts"]
}
```

- [ ] **Step 7: Install + run everything**

```
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm conformance
```

Expected: all green. Total: 64 unit tests (existing) + 12 fs-adapters tests = 76 + 11 conformance fixtures.

- [ ] **Step 8: Commit**

```bash
git add packages/core packages/fs-adapters spec/conformance/harness pnpm-lock.yaml
git commit -m "refactor: migrate FsReader consumers to shared @zettelgeist/fs-adapters"
```

---

## Phase 2 — `packages/cli/` (Tasks 5–17)

The Node CLI binary `zettelgeist`. Uses Node's built-in `parseArgs` plus a small subcommand router.

### Task 5: CLI package skeleton

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsconfig.build.json`
- Create: `packages/cli/src/bin.ts` (stub — Tasks 6+ flesh out)

- [ ] **Step 1: Create `packages/cli/package.json`**

```json
{
  "name": "@zettelgeist/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "zettelgeist": "./dist/bin.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json && chmod +x dist/bin.js",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@zettelgeist/core": "workspace:*",
    "@zettelgeist/fs-adapters": "workspace:*"
  }
}
```

The `chmod +x` in the build script ensures the `bin` shim has the executable bit so `npm install -g` (or `pnpm link --global`) symlinks it correctly.

- [ ] **Step 2: Create `packages/cli/tsconfig.json`** (mirror fs-adapters):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/cli/tsconfig.build.json`**:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `packages/cli/src/bin.ts`** (stub):

```ts
#!/usr/bin/env node
// Subcommand router lands in Task 7. For now this is a placeholder.
console.log('zettelgeist v0.1 (Plan 2 in progress)');
```

- [ ] **Step 5: Install + build**

```
pnpm install
pnpm --filter @zettelgeist/cli build
```

Expected: `packages/cli/dist/bin.js` exists with executable bit set. Verify with `ls -l packages/cli/dist/bin.js`.

Run: `node packages/cli/dist/bin.js`
Expected: prints `zettelgeist v0.1 (Plan 2 in progress)`.

- [ ] **Step 6: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "chore(cli): scaffold package with bin entry"
```

---

### Task 6: `output.ts` — JSON envelope helpers

**Files:**
- Create: `packages/cli/src/output.ts`
- Create: `packages/cli/tests/output.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/output.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { okEnvelope, errorEnvelope, emit } from '../src/output.js';

describe('okEnvelope', () => {
  it('builds an ok envelope', () => {
    expect(okEnvelope({ x: 1 })).toEqual({ ok: true, data: { x: 1 } });
  });
});

describe('errorEnvelope', () => {
  it('builds an error envelope without detail', () => {
    expect(errorEnvelope('oops')).toEqual({ ok: false, error: { message: 'oops' } });
  });

  it('builds an error envelope with detail', () => {
    expect(errorEnvelope('oops', { code: 'X' })).toEqual({
      ok: false,
      error: { message: 'oops', detail: { code: 'X' } },
    });
  });
});

describe('emit', () => {
  it('writes JSON to stdout when json mode is on', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit(
      { json: true, writeStdout, writeStderr },
      okEnvelope({ x: 1 }),
      () => 'human',
    );
    expect(writeStdout).toHaveBeenCalledWith('{"ok":true,"data":{"x":1}}\n');
    expect(writeStderr).not.toHaveBeenCalled();
  });

  it('writes human output when json mode is off', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit(
      { json: false, writeStdout, writeStderr },
      okEnvelope({ x: 1 }),
      () => 'human-rendered',
    );
    expect(writeStdout).toHaveBeenCalledWith('human-rendered\n');
  });

  it('writes errors to stderr when json mode is off', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit(
      { json: false, writeStdout, writeStderr },
      errorEnvelope('oops'),
      () => 'should not be called',
    );
    expect(writeStderr).toHaveBeenCalledWith('error: oops\n');
    expect(writeStdout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test output
```

- [ ] **Step 3: Implement `output.ts`**

`packages/cli/src/output.ts`:

```ts
export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; detail?: unknown } };

export interface EmitContext {
  json: boolean;
  writeStdout: (s: string) => void;
  writeStderr: (s: string) => void;
}

export function okEnvelope<T>(data: T): Envelope<T> {
  return { ok: true, data };
}

export function errorEnvelope(message: string, detail?: unknown): Envelope<never> {
  if (detail === undefined) return { ok: false, error: { message } };
  return { ok: false, error: { message, detail } };
}

export function emit<T>(
  ctx: EmitContext,
  env: Envelope<T>,
  humanRender: () => string,
): void {
  if (ctx.json) {
    ctx.writeStdout(JSON.stringify(env) + '\n');
    return;
  }
  if (env.ok) {
    ctx.writeStdout(humanRender() + '\n');
  } else {
    ctx.writeStderr(`error: ${env.error.message}\n`);
  }
}

/** Real EmitContext for use in bin.ts. Tests inject mocks. */
export const realEmitContext = (json: boolean): EmitContext => ({
  json,
  writeStdout: (s) => process.stdout.write(s),
  writeStderr: (s) => process.stderr.write(s),
});
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test output
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): JSON envelope and emit helpers"
```

---

### Task 7: `router.ts` — subcommand routing on top of `parseArgs`

**Files:**
- Create: `packages/cli/src/router.ts`
- Create: `packages/cli/tests/router.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseInvocation } from '../src/router.js';

describe('parseInvocation', () => {
  it('parses a bare command', () => {
    expect(parseInvocation(['regen'])).toEqual({
      kind: 'command',
      name: 'regen',
      args: [],
      flags: { json: false, help: false },
    });
  });

  it('parses positional args after the command', () => {
    expect(parseInvocation(['tick', 'user-auth', '3'])).toEqual({
      kind: 'command',
      name: 'tick',
      args: ['user-auth', '3'],
      flags: { json: false, help: false },
    });
  });

  it('parses --json flag', () => {
    expect(parseInvocation(['regen', '--json'])).toEqual({
      kind: 'command',
      name: 'regen',
      args: [],
      flags: { json: true, help: false },
    });
  });

  it('parses --check flag (regen-specific)', () => {
    const inv = parseInvocation(['regen', '--check']);
    expect(inv).toMatchObject({ kind: 'command', name: 'regen' });
    expect(inv.kind === 'command' && inv.flags.check).toBe(true);
  });

  it('treats no arguments as help request', () => {
    expect(parseInvocation([])).toEqual({ kind: 'help', topic: null });
  });

  it('treats --help as help request', () => {
    expect(parseInvocation(['--help'])).toEqual({ kind: 'help', topic: null });
    expect(parseInvocation(['regen', '--help'])).toEqual({ kind: 'help', topic: 'regen' });
  });

  it('returns unknown-command for unrecognized commands', () => {
    expect(parseInvocation(['floob'])).toEqual({
      kind: 'unknown-command',
      name: 'floob',
    });
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test router
```

- [ ] **Step 3: Implement `router.ts`**

`packages/cli/src/router.ts`:

```ts
import { parseArgs } from 'node:util';

export type Invocation =
  | {
      kind: 'command';
      name: string;
      args: string[];
      flags: { json: boolean; help: boolean; check?: boolean; force?: boolean; all?: boolean; 'no-tasks'?: boolean; 'no-handoff'?: boolean };
    }
  | { kind: 'help'; topic: string | null }
  | { kind: 'unknown-command'; name: string };

const KNOWN_COMMANDS = new Set([
  'regen', 'validate', 'new', 'tick', 'untick', 'claim', 'release',
  'status', 'install-hook', 'serve',
]);

const FLAG_OPTIONS = {
  json: { type: 'boolean' as const },
  help: { type: 'boolean' as const, short: 'h' },
  check: { type: 'boolean' as const },
  force: { type: 'boolean' as const },
  all: { type: 'boolean' as const },
  'no-tasks': { type: 'boolean' as const },
  'no-handoff': { type: 'boolean' as const },
};

export function parseInvocation(argv: string[]): Invocation {
  if (argv.length === 0) return { kind: 'help', topic: null };
  if (argv[0] === '--help' || argv[0] === '-h') return { kind: 'help', topic: null };

  const [first, ...rest] = argv;
  if (!first) return { kind: 'help', topic: null };
  if (!KNOWN_COMMANDS.has(first)) return { kind: 'unknown-command', name: first };

  // For --help on a known command, short-circuit before parseArgs.
  if (rest.includes('--help') || rest.includes('-h')) {
    return { kind: 'help', topic: first };
  }

  const { values, positionals } = parseArgs({
    args: rest,
    options: FLAG_OPTIONS,
    allowPositionals: true,
  });

  return {
    kind: 'command',
    name: first,
    args: positionals,
    flags: {
      json: values.json ?? false,
      help: values.help ?? false,
      ...(values.check !== undefined ? { check: values.check } : {}),
      ...(values.force !== undefined ? { force: values.force } : {}),
      ...(values.all !== undefined ? { all: values.all } : {}),
      ...(values['no-tasks'] !== undefined ? { 'no-tasks': values['no-tasks'] } : {}),
      ...(values['no-handoff'] !== undefined ? { 'no-handoff': values['no-handoff'] } : {}),
    },
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test router
```
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): subcommand router on Node parseArgs"
```

---

### Task 8: `git.ts` — git subprocess helpers

**Files:**
- Create: `packages/cli/src/git.ts`
- Create: `packages/cli/tests/git.test.ts`

The CLI shells out to `git` for: committing files, detecting the default branch, listing merged-to-default specs, and writing the pre-commit hook. Wrap these in a thin module that's testable (the hook installer in particular has nontrivial logic).

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/git.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mergeHookContent, HOOK_BLOCK } from '../src/git.js';

describe('mergeHookContent', () => {
  it('returns the marker block alone when input is null or empty', () => {
    expect(mergeHookContent(null)).toBe(HOOK_BLOCK + '\n');
    expect(mergeHookContent('')).toBe(HOOK_BLOCK + '\n');
  });

  it('replaces an existing marker block idempotently', () => {
    const existing =
      'echo "before"\n' +
      HOOK_BLOCK + '\n' +
      'echo "after"\n';
    const result = mergeHookContent(existing);
    expect(result).toBe(
      'echo "before"\n' +
      HOOK_BLOCK + '\n' +
      'echo "after"\n',
    );
    // Idempotent: re-running on the result is identical.
    expect(mergeHookContent(result)).toBe(result);
  });

  it('throws when existing content has non-marker hooks', () => {
    expect(() => mergeHookContent('echo "user hook"\n')).toThrow(/non-marker/i);
  });

  it('appends marker block to an empty existing file (no content other than shebang)', () => {
    const existing = '#!/usr/bin/env sh\n';
    const result = mergeHookContent(existing);
    expect(result).toBe(existing + HOOK_BLOCK + '\n');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test git
```

- [ ] **Step 3: Implement `git.ts`**

`packages/cli/src/git.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const execFileP = promisify(execFile);

export const HOOK_MARKER_BEGIN = '# >>> zettelgeist >>>';
export const HOOK_MARKER_END = '# <<< zettelgeist <<<';
export const HOOK_BLOCK =
  HOOK_MARKER_BEGIN + '\n' +
  'zettelgeist regen --check\n' +
  HOOK_MARKER_END;

const SHEBANG_RE = /^#!\s*\/[^\n]*\n/;

/**
 * Compute the new content of `.git/hooks/pre-commit` given the current content.
 * - `null` or empty: install the marker block alone.
 * - Existing marker block: replace it idempotently (preserve surrounding content).
 * - File with only a shebang: append the marker block after the shebang.
 * - File with non-marker content: throw — caller must --force or merge by hand.
 */
export function mergeHookContent(existing: string | null): string {
  if (existing === null || existing === '') return HOOK_BLOCK + '\n';

  // If the marker block exists, replace it (idempotency).
  const beginIdx = existing.indexOf(HOOK_MARKER_BEGIN);
  const endIdx = existing.indexOf(HOOK_MARKER_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + HOOK_MARKER_END.length);
    return before + HOOK_BLOCK + after;
  }

  // If the file is only a shebang, append our block.
  const shebangMatch = existing.match(SHEBANG_RE);
  const stripped = shebangMatch
    ? existing.slice(shebangMatch[0].length).trim()
    : existing.trim();
  if (stripped === '') {
    return existing + HOOK_BLOCK + '\n';
  }

  throw new Error(
    'pre-commit hook contains non-marker content; refuse to overwrite. ' +
      'Use --force to back it up to pre-commit.before-zettelgeist and replace, ' +
      'or merge the marker block manually.'
  );
}

export async function gitCommit(repoRoot: string, files: string[], message: string): Promise<string> {
  await execFileP('git', ['add', ...files], { cwd: repoRoot });
  await execFileP('git', ['commit', '-m', message], { cwd: repoRoot });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

export async function gitDefaultBranch(repoRoot: string): Promise<string> {
  // Try origin/HEAD first, fall back to current branch.
  try {
    const { stdout } = await execFileP('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: repoRoot });
    return stdout.trim().replace(/^refs\/remotes\/origin\//, '');
  } catch {
    const { stdout } = await execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot });
    return stdout.trim();
  }
}

export async function gitRepoRoot(cwd: string): Promise<string> {
  const { stdout } = await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd });
  return stdout.trim();
}

export async function installPreCommitHook(
  repoRoot: string,
  options: { force?: boolean } = {},
): Promise<{ installed: boolean; backup?: string }> {
  const hookDir = path.join(repoRoot, '.git', 'hooks');
  const hookPath = path.join(hookDir, 'pre-commit');
  await fs.mkdir(hookDir, { recursive: true });

  let existing: string | null = null;
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    // file doesn't exist
  }

  let next: string;
  let backup: string | undefined;
  try {
    next = mergeHookContent(existing);
  } catch (err) {
    if (!options.force) throw err;
    backup = `${hookPath}.before-zettelgeist`;
    if (existing !== null) await fs.writeFile(backup, existing, 'utf8');
    next = HOOK_BLOCK + '\n';
  }

  await fs.writeFile(hookPath, next, 'utf8');
  await fs.chmod(hookPath, 0o755);
  return backup ? { installed: true, backup } : { installed: true };
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test git
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): git subprocess helpers + smart-merge hook installer"
```

---

### Task 9: `regen` command

**Files:**
- Create: `packages/cli/src/commands/regen.ts`
- Create: `packages/cli/tests/regen.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/regen.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { regenCommand } from '../src/commands/regen.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-regen-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('regenCommand', () => {
  it('writes INDEX.md when missing', async () => {
    const result = await regenCommand({ path: tmp, check: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.changed).toBe(true);

    const written = await fs.readFile(path.join(tmp, 'specs', 'INDEX.md'), 'utf8').catch(() => null);
    // No specs/ dir yet, so INDEX.md is written at... wait. Where does it land for an empty repo?
    // Per the design, INDEX.md lives at <specsDir>/INDEX.md. If specs/ doesn't exist, regen creates it.
    // For Plan 2 implementation: ensure the directory exists before writing.
    expect(written).toContain('_No specs._');
  });

  it('returns no-change when INDEX.md is already up to date', async () => {
    // First regen creates the file.
    await regenCommand({ path: tmp, check: false });
    // Second regen: nothing to write.
    const result = await regenCommand({ path: tmp, check: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.changed).toBe(false);
  });

  it('--check exits ok if INDEX.md is current', async () => {
    await regenCommand({ path: tmp, check: false });
    const result = await regenCommand({ path: tmp, check: true });
    expect(result.ok).toBe(true);
  });

  it('--check returns error if INDEX.md is stale or missing', async () => {
    const result = await regenCommand({ path: tmp, check: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/stale|missing/i);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test regen
```

- [ ] **Step 3: Implement `regen.ts`**

`packages/cli/src/commands/regen.ts`:

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runConformance } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export interface RegenInput {
  path: string;
  check: boolean;
}

export interface RegenOk {
  changed: boolean;
  path: string;  // resolved INDEX.md path
}

export async function regenCommand(input: RegenInput): Promise<Envelope<RegenOk>> {
  const reader = makeDiskFsReader(input.path);

  // Verify it's a Zettelgeist repo.
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  let result;
  try {
    result = await runConformance(reader);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorEnvelope(msg);
  }

  // Determine specsDir from .zettelgeist.yaml — runConformance parses it but doesn't expose it.
  // For simplicity, re-load via loadConfig:
  const { loadConfig } = await import('@zettelgeist/core');
  const cfg = await loadConfig(reader);
  const specsDir = cfg.config.specsDir;
  const indexAbsPath = path.join(input.path, specsDir, 'INDEX.md');
  const indexRelPath = path.posix.join(specsDir, 'INDEX.md');

  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(indexAbsPath, 'utf8');
  } catch {
    // missing
  }

  const generated = result.index;

  if (onDisk === generated) {
    return okEnvelope({ changed: false, path: indexRelPath });
  }

  if (input.check) {
    return errorEnvelope(
      onDisk === null ? `${indexRelPath} is missing` : `${indexRelPath} is stale`,
    );
  }

  // Atomic write: write to <path>.tmp then rename.
  await fs.mkdir(path.dirname(indexAbsPath), { recursive: true });
  const tmpPath = `${indexAbsPath}.tmp`;
  await fs.writeFile(tmpPath, generated, 'utf8');
  await fs.rename(tmpPath, indexAbsPath);

  return okEnvelope({ changed: true, path: indexRelPath });
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test regen
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): regen command (write + --check)"
```

---

### Task 9b: Content-aware regen cache via git tree SHA

Layered on top of Task 9's regen. Uses `git rev-parse HEAD:<specs_dir>` to get the tree SHA — git already hashed the entire `specs/` subtree for us. If that tree SHA matches the cached value, the generated INDEX hasn't changed; skip the walk and reuse the cached output. Caches at `.zettelgeist/regen-cache.json` (gitignored).

**Files:**
- Modify: `packages/cli/src/commands/regen.ts`
- Modify: `packages/cli/tests/regen.test.ts`
- Modify: `.gitignore` (add `.zettelgeist/regen-cache.json`)

- [ ] **Step 1: Update `.gitignore`**

Append a new line at the end of `/Users/moritz/Code/morrieinmaas/zettelgeist/.gitignore`:

```gitignore
.zettelgeist/regen-cache.json
```

Note: do NOT gitignore the whole `.zettelgeist/` directory — the design doc (Plan 2 §10) reserves that path for user-managed customization (e.g., `viewer.css`) which the user may want to commit.

- [ ] **Step 2: Write failing tests for cache behavior**

Add these tests to `packages/cli/tests/regen.test.ts` (alongside the existing tests):

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

async function gitInit(dir: string): Promise<void> {
  await execFileP('git', ['init', '-q'], { cwd: dir });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: dir });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: dir });
  await execFileP('git', ['add', '.'], { cwd: dir });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('regenCommand cache', () => {
  it('writes a cache file after first regen in a git repo', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    const cacheRaw = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    const cache = JSON.parse(cacheRaw);
    expect(cache.tree_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(cache.generated_index).toContain('_No specs._');
  });

  it('reuses cache when tree SHA matches', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    // Re-run regen. The cache should be a hit; we can't directly observe "didn't walk specs/"
    // but we can verify that the cache file is still present and unchanged.
    const cacheBefore = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    await regenCommand({ path: tmp, check: false });
    const cacheAfter = await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8');
    expect(cacheAfter).toBe(cacheBefore);
  });

  it('regenerates and updates cache when tree SHA changes', async () => {
    await gitInit(tmp);
    await regenCommand({ path: tmp, check: false });
    const cacheBefore = JSON.parse(
      await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8'),
    );

    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'add foo'], { cwd: tmp });

    await regenCommand({ path: tmp, check: false });
    const cacheAfter = JSON.parse(
      await fs.readFile(path.join(tmp, '.zettelgeist', 'regen-cache.json'), 'utf8'),
    );

    expect(cacheAfter.tree_sha).not.toBe(cacheBefore.tree_sha);
    expect(cacheAfter.generated_index).toContain('| foo |');
  });

  it('works gracefully in a non-git directory (no cache, no error)', async () => {
    // tmp is NOT git-initialized in this test — beforeEach already populated .zettelgeist.yaml
    // but we did not call gitInit. The default beforeEach does NOT initialize git.
    const result = await regenCommand({ path: tmp, check: false });
    expect(result.ok).toBe(true);
    // Cache file MAY or MAY NOT exist, but the command must not error.
  });
});
```

- [ ] **Step 3: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test regen
```
Expected: cache tests fail (cache logic doesn't exist yet).

- [ ] **Step 4: Update `regen.ts` to use the cache**

Replace `packages/cli/src/commands/regen.ts` with:

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

const execFileP = promisify(execFile);

export interface RegenInput {
  path: string;
  check: boolean;
}

export interface RegenOk {
  changed: boolean;
  path: string;  // resolved INDEX.md relpath
  cacheHit?: boolean;
}

interface CacheEntry {
  tree_sha: string;
  generated_index: string;
}

const CACHE_RELPATH = path.join('.zettelgeist', 'regen-cache.json');

async function getSpecsTreeSha(repoPath: string, specsDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP('git', ['rev-parse', `HEAD:${specsDir}`], { cwd: repoPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function readCache(repoPath: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(path.join(repoPath, CACHE_RELPATH), 'utf8');
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof parsed.tree_sha !== 'string' || typeof parsed.generated_index !== 'string') return null;
    return { tree_sha: parsed.tree_sha, generated_index: parsed.generated_index };
  } catch {
    return null;
  }
}

async function writeCache(repoPath: string, entry: CacheEntry): Promise<void> {
  const cacheDir = path.join(repoPath, '.zettelgeist');
  await fs.mkdir(cacheDir, { recursive: true });
  const tmpPath = path.join(cacheDir, 'regen-cache.json.tmp');
  await fs.writeFile(tmpPath, JSON.stringify(entry, null, 2) + '\n', 'utf8');
  await fs.rename(tmpPath, path.join(cacheDir, 'regen-cache.json'));
}

export async function regenCommand(input: RegenInput): Promise<Envelope<RegenOk>> {
  const reader = makeDiskFsReader(input.path);

  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  const cfg = await loadConfig(reader);
  const specsDir = cfg.config.specsDir;
  const indexAbsPath = path.join(input.path, specsDir, 'INDEX.md');
  const indexRelPath = path.posix.join(specsDir, 'INDEX.md');

  // Try cache first.
  const treeSha = await getSpecsTreeSha(input.path, specsDir);
  let generated: string | null = null;
  let cacheHit = false;
  if (treeSha) {
    const cache = await readCache(input.path);
    if (cache && cache.tree_sha === treeSha) {
      generated = cache.generated_index;
      cacheHit = true;
    }
  }

  if (generated === null) {
    let result;
    try {
      result = await runConformance(reader);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorEnvelope(msg);
    }
    generated = result.index;
    if (treeSha) {
      await writeCache(input.path, { tree_sha: treeSha, generated_index: generated });
    }
  }

  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(indexAbsPath, 'utf8');
  } catch {
    // missing
  }

  if (onDisk === generated) {
    return okEnvelope({ changed: false, path: indexRelPath, cacheHit });
  }

  if (input.check) {
    return errorEnvelope(
      onDisk === null ? `${indexRelPath} is missing` : `${indexRelPath} is stale`,
    );
  }

  await fs.mkdir(path.dirname(indexAbsPath), { recursive: true });
  const tmpPath = `${indexAbsPath}.tmp`;
  await fs.writeFile(tmpPath, generated, 'utf8');
  await fs.rename(tmpPath, indexAbsPath);

  return okEnvelope({ changed: true, path: indexRelPath, cacheHit });
}
```

Key changes from Task 9's `regen.ts`:

- New helpers: `getSpecsTreeSha`, `readCache`, `writeCache`.
- `RegenOk` gains an optional `cacheHit` field (true when we used the cache, false otherwise).
- Before running `runConformance`, try the cache. Only walk if it's a miss.
- Only cache when there's a tree SHA (i.e., the path is a git repo with a `specs/` tree at HEAD). In a non-git directory or pre-first-commit state, the cache layer is a no-op.

- [ ] **Step 5: Run all regen tests — expect pass**

```
pnpm --filter @zettelgeist/cli test regen
```
Expected: 4 (existing) + 4 (cache) = 8 tests pass.

- [ ] **Step 6: Run conformance + typecheck**

```
pnpm conformance
pnpm -r typecheck
```

The conformance harness uses `runConformance` directly (not the CLI), so it's unaffected by the cache. Both should pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cli .gitignore
git commit -m "feat(cli): cache regen output by git tree SHA of specs/"
```

---

### Task 10: `validate` command

**Files:**
- Create: `packages/cli/src/commands/validate.ts`
- Create: `packages/cli/tests/validate.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/validate.test.ts`:

```ts
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
  it('returns ok with empty errors for a healthy repo', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# Foo\n');
    const result = await validateCommand({ path: tmp });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.errors).toEqual([]);
  });

  it('returns error envelope listing validation errors', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'a'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'specs', 'b'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'specs', 'a', 'requirements.md'),
      '---\ndepends_on: [b]\n---\n',
    );
    await fs.writeFile(
      path.join(tmp, 'specs', 'b', 'requirements.md'),
      '---\ndepends_on: [a]\n---\n',
    );
    const result = await validateCommand({ path: tmp });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/validation error/i);
      const detail = result.error.detail as { errors: Array<{ code: string }> };
      expect(detail.errors.some((e) => e.code === 'E_CYCLE')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test validate
```

- [ ] **Step 3: Implement `validate.ts`**

`packages/cli/src/commands/validate.ts`:

```ts
import { validateRepo, loadConfig, type ValidationError } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export interface ValidateInput {
  path: string;
}

export interface ValidateOk {
  errors: ValidationError[];
}

export async function validateCommand(input: ValidateInput): Promise<Envelope<ValidateOk>> {
  const reader = makeDiskFsReader(input.path);

  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  const cfg = await loadConfig(reader);
  const validation = await validateRepo(reader, cfg.config.specsDir);
  const allErrors = [...cfg.errors, ...validation.errors];

  if (allErrors.length === 0) {
    return okEnvelope({ errors: [] });
  }

  const count = allErrors.length;
  return errorEnvelope(
    `${count} validation error${count === 1 ? '' : 's'}`,
    { errors: allErrors },
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test validate
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): validate command"
```

---

### Task 11: `new` command (scaffold a spec)

**Files:**
- Create: `packages/cli/src/commands/new.ts`
- Create: `packages/cli/tests/new.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/new.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { newCommand } from '../src/commands/new.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-new-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  // initialize git so commits work
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'Test'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('newCommand', () => {
  it('creates requirements.md, tasks.md, handoff.md with stubs and commits', async () => {
    const result = await newCommand({ path: tmp, name: 'user-auth', noTasks: false, noHandoff: false });
    expect(result.ok).toBe(true);

    const reqs = await fs.readFile(path.join(tmp, 'specs', 'user-auth', 'requirements.md'), 'utf8');
    expect(reqs).toContain('# user-auth');

    const tasks = await fs.readFile(path.join(tmp, 'specs', 'user-auth', 'tasks.md'), 'utf8');
    expect(tasks).toContain('# Tasks');

    const handoff = await fs.readFile(path.join(tmp, 'specs', 'user-auth', 'handoff.md'), 'utf8');
    expect(handoff).toBeDefined();

    if (result.ok) expect(result.data.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('rejects invalid spec names', async () => {
    const result = await newCommand({ path: tmp, name: 'BAD_NAME', noTasks: false, noHandoff: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/invalid spec name/i);
  });

  it('rejects existing spec names', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    const result = await newCommand({ path: tmp, name: 'foo', noTasks: false, noHandoff: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/already exists/i);
  });

  it('respects --no-tasks flag', async () => {
    const result = await newCommand({ path: tmp, name: 'minimal', noTasks: true, noHandoff: true });
    expect(result.ok).toBe(true);
    expect(await fs.access(path.join(tmp, 'specs', 'minimal', 'requirements.md')).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmp, 'specs', 'minimal', 'tasks.md')).then(() => true).catch(() => false)).toBe(false);
    expect(await fs.access(path.join(tmp, 'specs', 'minimal', 'handoff.md')).then(() => true).catch(() => false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test new
```

- [ ] **Step 3: Implement `new.ts`**

`packages/cli/src/commands/new.ts`:

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { gitCommit } from '../git.js';
import { regenCommand } from './regen.js';

const SPEC_NAME_RE = /^[a-z0-9-]+$/;

const REQUIREMENTS_STUB = (name: string): string =>
  `---\ndepends_on: []\n---\n# ${name}\n\n(write requirements here)\n`;

const TASKS_STUB = `# Tasks\n\n- [ ] 1. (first task)\n`;

const HANDOFF_STUB = (name: string): string =>
  `# Handoff — ${name}\n\n## Last session\n\n(empty — first session)\n\n## Next step\n\n(none — fresh spec)\n`;

export interface NewInput {
  path: string;
  name: string;
  noTasks: boolean;
  noHandoff: boolean;
}

export interface NewOk {
  spec: string;
  filesCreated: string[];
  commit: string;
}

export async function newCommand(input: NewInput): Promise<Envelope<NewOk>> {
  if (!SPEC_NAME_RE.test(input.name)) {
    return errorEnvelope(`invalid spec name: "${input.name}" (must match [a-z0-9-]+)`);
  }

  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  const cfg = await loadConfig(reader);
  const specDir = path.join(input.path, cfg.config.specsDir, input.name);

  if (await fs.access(specDir).then(() => true).catch(() => false)) {
    return errorEnvelope(`spec already exists: ${cfg.config.specsDir}/${input.name}`);
  }

  await fs.mkdir(specDir, { recursive: true });

  const filesCreated: string[] = [];
  await fs.writeFile(path.join(specDir, 'requirements.md'), REQUIREMENTS_STUB(input.name), 'utf8');
  filesCreated.push(`${cfg.config.specsDir}/${input.name}/requirements.md`);

  if (!input.noTasks) {
    await fs.writeFile(path.join(specDir, 'tasks.md'), TASKS_STUB, 'utf8');
    filesCreated.push(`${cfg.config.specsDir}/${input.name}/tasks.md`);
  }
  if (!input.noHandoff) {
    await fs.writeFile(path.join(specDir, 'handoff.md'), HANDOFF_STUB(input.name), 'utf8');
    filesCreated.push(`${cfg.config.specsDir}/${input.name}/handoff.md`);
  }

  // Regenerate INDEX.md
  await regenCommand({ path: input.path, check: false });

  // Commit
  const indexPath = `${cfg.config.specsDir}/INDEX.md`;
  const commit = await gitCommit(input.path, [...filesCreated, indexPath], `[zg] new: ${input.name}`);

  return okEnvelope({ spec: input.name, filesCreated, commit });
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test new
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): new command (scaffold spec + commit)"
```

---

### Task 12: `tick` and `untick` commands

**Files:**
- Create: `packages/cli/src/commands/tick.ts` (handles both tick and untick — single function with a `checked: boolean` arg)
- Create: `packages/cli/tests/tick.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/tick.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { tickCommand } from '../src/commands/tick.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-tick-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await fs.writeFile(
    path.join(tmp, 'specs', 'foo', 'tasks.md'),
    '- [ ] 1. one\n- [ ] 2. two\n- [ ] 3. three\n',
  );
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e.com'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('tickCommand', () => {
  it('flips an unchecked box to checked at index n', async () => {
    const result = await tickCommand({ path: tmp, spec: 'foo', n: 2, checked: true });
    expect(result.ok).toBe(true);
    const tasks = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(tasks.split('\n')[1]).toContain('[x]');
  });

  it('flips a checked box to unchecked', async () => {
    await fs.writeFile(
      path.join(tmp, 'specs', 'foo', 'tasks.md'),
      '- [x] 1. one\n- [ ] 2. two\n',
    );
    const result = await tickCommand({ path: tmp, spec: 'foo', n: 1, checked: false });
    expect(result.ok).toBe(true);
    const tasks = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(tasks.split('\n')[0]).toContain('[ ]');
  });

  it('rejects out-of-range n', async () => {
    const result = await tickCommand({ path: tmp, spec: 'foo', n: 99, checked: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/no task at index 99/i);
  });

  it('rejects unknown spec', async () => {
    const result = await tickCommand({ path: tmp, spec: 'ghost', n: 1, checked: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/no such spec/i);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test tick
```

- [ ] **Step 3: Implement `tick.ts`**

`packages/cli/src/commands/tick.ts`:

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { gitCommit } from '../git.js';
import { regenCommand } from './regen.js';

const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;

export interface TickInput {
  path: string;
  spec: string;
  n: number;
  checked: boolean;  // true = tick, false = untick
}

export interface TickOk {
  spec: string;
  index: number;
  commit: string;
}

export async function tickCommand(input: TickInput): Promise<Envelope<TickOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }
  const cfg = await loadConfig(reader);
  const tasksRel = path.posix.join(cfg.config.specsDir, input.spec, 'tasks.md');
  const tasksAbs = path.join(input.path, tasksRel);

  let body: string;
  try {
    body = await fs.readFile(tasksAbs, 'utf8');
  } catch {
    return errorEnvelope(`no such spec: ${input.spec}`);
  }

  const lines = body.split('\n');
  let count = 0;
  let mutated = false;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i]?.match(TASK_LINE);
    if (!m) continue;
    count += 1;
    if (count === input.n) {
      const newMark = input.checked ? 'x' : ' ';
      lines[i] = m[1] + newMark + m[3];
      mutated = true;
      break;
    }
  }

  if (!mutated) {
    return errorEnvelope(`no task at index ${input.n} in ${input.spec}`);
  }

  // Atomic write
  const newBody = lines.join('\n');
  const tmpPath = `${tasksAbs}.tmp`;
  await fs.writeFile(tmpPath, newBody, 'utf8');
  await fs.rename(tmpPath, tasksAbs);

  // Regen
  await regenCommand({ path: input.path, check: false });

  // Commit
  const indexRel = path.posix.join(cfg.config.specsDir, 'INDEX.md');
  const op = input.checked ? 'tick' : 'untick';
  const commit = await gitCommit(input.path, [tasksRel, indexRel], `[zg] ${op}: ${input.spec}#${input.n}`);

  return okEnvelope({ spec: input.spec, index: input.n, commit });
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test tick
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): tick and untick commands"
```

---

### Task 13: `claim` and `release` commands

**Files:**
- Create: `packages/cli/src/commands/claim.ts` (handles both claim and release; small enough to share a file)
- Create: `packages/cli/tests/claim.test.ts`

`.claim` files are gitignored (Plan 1's `.gitignore` already has `.claim`). They contain `<agent_id>\n<timestamp>\n` so consumers can detect staleness.

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/claim.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { claimCommand, releaseCommand } from '../src/commands/claim.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-claim-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('claimCommand', () => {
  it('writes .claim with agent_id and timestamp', async () => {
    const result = await claimCommand({ path: tmp, spec: 'foo', agentId: 'alice@laptop' });
    expect(result.ok).toBe(true);
    const content = await fs.readFile(path.join(tmp, 'specs', 'foo', '.claim'), 'utf8');
    expect(content).toContain('alice@laptop');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects unknown spec', async () => {
    const result = await claimCommand({ path: tmp, spec: 'ghost', agentId: 'a@b' });
    expect(result.ok).toBe(false);
  });

  it('overwrites an existing .claim (re-claim)', async () => {
    await claimCommand({ path: tmp, spec: 'foo', agentId: 'alice@laptop' });
    const result = await claimCommand({ path: tmp, spec: 'foo', agentId: 'bob@desk' });
    expect(result.ok).toBe(true);
    const content = await fs.readFile(path.join(tmp, 'specs', 'foo', '.claim'), 'utf8');
    expect(content).toContain('bob@desk');
  });
});

describe('releaseCommand', () => {
  it('removes the .claim file', async () => {
    await fs.writeFile(path.join(tmp, 'specs', 'foo', '.claim'), 'a@b\n2026-05-09T00:00:00Z\n');
    const result = await releaseCommand({ path: tmp, spec: 'foo' });
    expect(result.ok).toBe(true);
    expect(await fs.access(path.join(tmp, 'specs', 'foo', '.claim')).then(() => true).catch(() => false)).toBe(false);
  });

  it('returns ok when no claim exists (idempotent)', async () => {
    const result = await releaseCommand({ path: tmp, spec: 'foo' });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown spec', async () => {
    const result = await releaseCommand({ path: tmp, spec: 'ghost' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test claim
```

- [ ] **Step 3: Implement `claim.ts`**

`packages/cli/src/commands/claim.ts`:

```ts
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export interface ClaimInput {
  path: string;
  spec: string;
  agentId?: string;
}

export interface ReleaseInput {
  path: string;
  spec: string;
}

function defaultAgentId(): string {
  const user = process.env.USER || process.env.USERNAME || 'unknown';
  const host = os.hostname() || 'localhost';
  return `${user}@${host}`;
}

async function specDirOrError(input: { path: string; spec: string }): Promise<{ dir: string } | { error: string }> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return { error: `not a zettelgeist repo: ${input.path}` };
  }
  const cfg = await loadConfig(reader);
  const dir = path.join(input.path, cfg.config.specsDir, input.spec);
  if (!(await fs.access(path.join(dir, 'requirements.md')).then(() => true).catch(() => false))
    && !(await fs.access(path.join(dir, 'tasks.md')).then(() => true).catch(() => false))) {
    // No top-level .md? Try directory exists with any .md content (loader semantics).
    const exists = await fs.access(dir).then(() => true).catch(() => false);
    if (!exists) return { error: `no such spec: ${input.spec}` };
  }
  return { dir };
}

export async function claimCommand(input: ClaimInput): Promise<Envelope<{ spec: string; agentId: string }>> {
  const r = await specDirOrError(input);
  if ('error' in r) return errorEnvelope(r.error);

  const agentId = input.agentId ?? defaultAgentId();
  const ts = new Date().toISOString();
  await fs.writeFile(path.join(r.dir, '.claim'), `${agentId}\n${ts}\n`, 'utf8');
  return okEnvelope({ spec: input.spec, agentId });
}

export async function releaseCommand(input: ReleaseInput): Promise<Envelope<{ spec: string }>> {
  const r = await specDirOrError(input);
  if ('error' in r) return errorEnvelope(r.error);

  await fs.unlink(path.join(r.dir, '.claim')).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
    // idempotent: missing .claim is fine
  });
  return okEnvelope({ spec: input.spec });
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test claim
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): claim and release commands"
```

---

### Task 14: `status` command

**Files:**
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/tests/status.test.ts`

`status` reads the repo, derives state, and emits a board summary (no `--all`) or single-spec detail (with a spec arg). With `--json` it emits structured data; without, a human-readable table.

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/status.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { statusCommand } from '../src/commands/status.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-status-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('statusCommand', () => {
  it('returns empty list for an empty repo', async () => {
    const result = await statusCommand({ path: tmp, spec: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.specs).toEqual([]);
  });

  it('returns a row per spec', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [x] one\n- [ ] two\n');

    await fs.mkdir(path.join(tmp, 'specs', 'bar'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'bar', 'requirements.md'), '# bar\n');

    const result = await statusCommand({ path: tmp, spec: null });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const names = result.data.specs.map((s) => s.name).sort();
      expect(names).toEqual(['bar', 'foo']);
      const foo = result.data.specs.find((s) => s.name === 'foo');
      expect(foo?.status).toBe('in-progress');
      expect(foo?.progress).toBe('1/2');
    }
  });

  it('returns single-spec detail when spec is given', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    const result = await statusCommand({ path: tmp, spec: 'foo' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.specs).toHaveLength(1);
      expect(result.data.specs[0]?.name).toBe('foo');
    }
  });

  it('returns error for missing spec', async () => {
    const result = await statusCommand({ path: tmp, spec: 'ghost' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test status
```

- [ ] **Step 3: Implement `status.ts`**

`packages/cli/src/commands/status.ts`:

```ts
import { loadAllSpecs, deriveStatus, loadConfig, type Status } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export interface StatusInput {
  path: string;
  spec: string | null;
}

export interface StatusRow {
  name: string;
  status: Status;
  progress: string;
  blockedBy: string | null;
}

export interface StatusOk {
  specs: StatusRow[];
}

export async function statusCommand(input: StatusInput): Promise<Envelope<StatusOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }
  const cfg = await loadConfig(reader);
  const allSpecs = await loadAllSpecs(reader, cfg.config.specsDir);
  const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };
  // TODO: detect claims and merged commits — punted to v0.2 per design doc

  const filtered = input.spec ? allSpecs.filter((s) => s.name === input.spec) : allSpecs;

  if (input.spec && filtered.length === 0) {
    return errorEnvelope(`no such spec: ${input.spec}`);
  }

  const rows: StatusRow[] = filtered.map((s) => {
    const status = deriveStatus(s, repoState);
    const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
    const checked = counted.filter((t) => t.checked).length;
    const blocked = typeof s.frontmatter.blocked_by === 'string' && s.frontmatter.blocked_by.trim() !== ''
      ? s.frontmatter.blocked_by.trim()
      : null;
    return { name: s.name, status, progress: `${checked}/${counted.length}`, blockedBy: blocked };
  });

  return okEnvelope({ specs: rows });
}

export function renderStatusHuman(rows: StatusRow[]): string {
  if (rows.length === 0) return '(no specs)';
  const headers = ['Spec', 'Status', 'Progress', 'Blocked by'];
  const data = rows.map((r) => [r.name, r.status, r.progress, r.blockedBy ?? '—']);
  const widths = headers.map((h, i) => Math.max(h.length, ...data.map((d) => (d[i] ?? '').length)));
  const fmt = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  return [fmt(headers), fmt(widths.map((w) => '-'.repeat(w))), ...data.map(fmt)].join('\n');
}
```

The `TODO` for claims/merged detection is acceptable for v0.1 because the design doc explicitly says claim staleness and merged-spec detection are implementation-defined and may be deferred.

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test status
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): status command (board + single-spec views)"
```

---

### Task 15: `install-hook` command

**Files:**
- Create: `packages/cli/src/commands/install-hook.ts`
- Create: `packages/cli/tests/install-hook.test.ts`

The smart-merge logic is already in `git.ts` (Task 8). This command is a thin wrapper that invokes `installPreCommitHook` and renders the result.

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/install-hook.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { installHookCommand } from '../src/commands/install-hook.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-hook-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('installHookCommand', () => {
  it('writes a fresh hook in a clean repo', async () => {
    const result = await installHookCommand({ path: tmp, force: false });
    expect(result.ok).toBe(true);
    const hook = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(hook).toContain('# >>> zettelgeist >>>');
    expect(hook).toContain('zettelgeist regen --check');
  });

  it('is idempotent on re-run', async () => {
    await installHookCommand({ path: tmp, force: false });
    const first = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    await installHookCommand({ path: tmp, force: false });
    const second = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(second).toBe(first);
  });

  it('rejects when a non-marker hook exists, no --force', async () => {
    await fs.mkdir(path.join(tmp, '.git', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'echo "user hook"\n');
    const result = await installHookCommand({ path: tmp, force: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/non-marker/i);
  });

  it('--force backs up the conflicting hook and replaces', async () => {
    await fs.mkdir(path.join(tmp, '.git', 'hooks'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'echo "user hook"\n');
    const result = await installHookCommand({ path: tmp, force: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.backup).toBeDefined();
    const backup = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit.before-zettelgeist'), 'utf8');
    expect(backup).toBe('echo "user hook"\n');
  });

  it('sets executable bit', async () => {
    await installHookCommand({ path: tmp, force: false });
    const stat = await fs.stat(path.join(tmp, '.git', 'hooks', 'pre-commit'));
    // 0o100 bit = owner exec
    expect(stat.mode & 0o100).toBe(0o100);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test install-hook
```

- [ ] **Step 3: Implement `install-hook.ts`**

`packages/cli/src/commands/install-hook.ts`:

```ts
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { installPreCommitHook, gitRepoRoot } from '../git.js';

export interface InstallHookInput {
  path: string;
  force: boolean;
}

export interface InstallHookOk {
  installed: true;
  backup?: string;
}

export async function installHookCommand(input: InstallHookInput): Promise<Envelope<InstallHookOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }

  let repoRoot: string;
  try {
    repoRoot = await gitRepoRoot(input.path);
  } catch {
    return errorEnvelope(`${input.path} is not a git repo`);
  }

  try {
    const result = await installPreCommitHook(repoRoot, { force: input.force });
    return okEnvelope({ installed: true, ...(result.backup ? { backup: result.backup } : {}) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorEnvelope(msg);
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test install-hook
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): install-hook command (smart-merge with --force backup)"
```

---

### Task 16: `serve` stub

**Files:**
- Create: `packages/cli/src/commands/serve.ts`
- Create: `packages/cli/tests/serve.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/cli/tests/serve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { serveCommand } from '../src/commands/serve.js';

describe('serveCommand', () => {
  it('returns a stub error directing to v0.2 / Plan 2.5', async () => {
    const result = await serveCommand({ path: '.' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/v0\.2|Plan 2\.5|not yet implemented/);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/cli test serve
```

- [ ] **Step 3: Implement `serve.ts`**

`packages/cli/src/commands/serve.ts`:

```ts
import { errorEnvelope, type Envelope } from '../output.js';

export interface ServeInput {
  path: string;
}

export async function serveCommand(_input: ServeInput): Promise<Envelope<never>> {
  return errorEnvelope(
    'viewer not yet implemented (ships in v0.2; tracked in Plan 2.5)',
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/cli test serve
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): serve stub command"
```

---

### Task 17: Wire `bin.ts` + e2e test

Replace the placeholder `bin.ts` with a real entrypoint that dispatches to commands. Add an e2e test that spawns the built bin against a tmpdir.

**Files:**
- Modify: `packages/cli/src/bin.ts`
- Modify: `packages/cli/src/router.ts` (if any tweaks emerge)
- Create: `packages/cli/tests/e2e.test.ts`

- [ ] **Step 1: Replace `bin.ts`**

`packages/cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { parseInvocation } from './router.js';
import { realEmitContext, errorEnvelope, emit } from './output.js';
import { regenCommand } from './commands/regen.js';
import { validateCommand } from './commands/validate.js';
import { newCommand } from './commands/new.js';
import { tickCommand } from './commands/tick.js';
import { claimCommand, releaseCommand } from './commands/claim.js';
import { statusCommand, renderStatusHuman } from './commands/status.js';
import { installHookCommand } from './commands/install-hook.js';
import { serveCommand } from './commands/serve.js';

const HELP = `zettelgeist — file-based spec-driven project management

Commands:
  regen [path]              Regenerate INDEX.md (--check exits 1 on stale)
  validate [path]           Run validateRepo, print errors
  new <name>                Scaffold a new spec
  tick <spec> <n>           Tick task n in spec
  untick <spec> <n>         Untick task n in spec
  claim <spec> [agent_id]   Write .claim file
  release <spec>            Remove .claim file
  status [spec]             Show board summary or single-spec detail
  install-hook              Install pre-commit hook (use --force to overwrite)
  serve                     [v0.1 stub: ships in v0.2]

Flags (most commands):
  --json                   Machine-readable JSON envelope output
  --help                   Show this message

Run 'zettelgeist <command> --help' for command-specific help.
`;

async function main(argv: string[]): Promise<number> {
  const inv = parseInvocation(argv);

  if (inv.kind === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (inv.kind === 'unknown-command') {
    process.stderr.write(`unknown command: ${inv.name}\n${HELP}`);
    return 1;
  }

  const ctx = realEmitContext(inv.flags.json);
  const cwd = process.cwd();

  try {
    switch (inv.name) {
      case 'regen': {
        const repoPath = inv.args[0] ?? cwd;
        const result = await regenCommand({ path: repoPath, check: inv.flags.check ?? false });
        emit(ctx, result, () =>
          result.ok ? (result.data.changed ? `wrote ${result.data.path}` : `${result.data.path} up to date`) : '',
        );
        return result.ok ? 0 : 1;
      }
      case 'validate': {
        const repoPath = inv.args[0] ?? cwd;
        const result = await validateCommand({ path: repoPath });
        emit(ctx, result, () =>
          result.ok ? '✓ no validation errors' : '',
        );
        return result.ok ? 0 : 1;
      }
      case 'new': {
        const name = inv.args[0];
        if (!name) {
          emit(ctx, errorEnvelope('usage: zettelgeist new <name>'), () => '');
          return 1;
        }
        const result = await newCommand({
          path: cwd, name,
          noTasks: inv.flags['no-tasks'] ?? false,
          noHandoff: inv.flags['no-handoff'] ?? false,
        });
        emit(ctx, result, () => result.ok ? `created spec ${result.data.spec} (${result.data.commit.slice(0, 7)})` : '');
        return result.ok ? 0 : 1;
      }
      case 'tick':
      case 'untick': {
        const [spec, nStr] = inv.args;
        const n = nStr ? parseInt(nStr, 10) : NaN;
        if (!spec || !Number.isFinite(n) || n < 1) {
          emit(ctx, errorEnvelope(`usage: zettelgeist ${inv.name} <spec> <n>`), () => '');
          return 1;
        }
        const result = await tickCommand({ path: cwd, spec, n, checked: inv.name === 'tick' });
        emit(ctx, result, () => result.ok ? `${inv.name} ${spec}#${n} (${result.data.commit.slice(0, 7)})` : '');
        return result.ok ? 0 : 1;
      }
      case 'claim': {
        const [spec, agentId] = inv.args;
        if (!spec) {
          emit(ctx, errorEnvelope('usage: zettelgeist claim <spec> [agent_id]'), () => '');
          return 1;
        }
        const result = await claimCommand({ path: cwd, spec, ...(agentId ? { agentId } : {}) });
        emit(ctx, result, () => result.ok ? `claimed ${spec} as ${result.data.agentId}` : '');
        return result.ok ? 0 : 1;
      }
      case 'release': {
        const [spec] = inv.args;
        if (!spec) {
          emit(ctx, errorEnvelope('usage: zettelgeist release <spec>'), () => '');
          return 1;
        }
        const result = await releaseCommand({ path: cwd, spec });
        emit(ctx, result, () => result.ok ? `released ${spec}` : '');
        return result.ok ? 0 : 1;
      }
      case 'status': {
        const [spec] = inv.args;
        const result = await statusCommand({ path: cwd, spec: spec ?? null });
        emit(ctx, result, () => result.ok ? renderStatusHuman(result.data.specs) : '');
        return result.ok ? 0 : 1;
      }
      case 'install-hook': {
        const result = await installHookCommand({ path: cwd, force: inv.flags.force ?? false });
        emit(ctx, result, () =>
          result.ok ? (result.data.backup ? `installed (backup at ${result.data.backup})` : 'installed') : '',
        );
        return result.ok ? 0 : 1;
      }
      case 'serve': {
        const result = await serveCommand({ path: cwd });
        emit(ctx, result, () => '');
        return result.ok ? 0 : 1;
      }
      default: {
        emit(ctx, errorEnvelope(`internal: command ${inv.name} not wired`), () => '');
        return 2;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(ctx, errorEnvelope(msg), () => '');
    return 2;
  }
}

main(process.argv.slice(2)).then((code) => process.exit(code));
```

- [ ] **Step 2: Build the CLI**

```
pnpm --filter @zettelgeist/cli build
```

Verify `packages/cli/dist/bin.js` is executable: `ls -l packages/cli/dist/bin.js`.

- [ ] **Step 3: Write e2e test**

`packages/cli/tests/e2e.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', 'dist', 'bin.js');

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-cli-e2e-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 'e2e@test'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'E2E'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function runBin(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileP('node', [BIN, ...args], { cwd: tmp });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('cli e2e', () => {
  it('prints help with no args', async () => {
    const r = await runBin([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('zettelgeist');
    expect(r.stdout).toContain('Commands:');
  });

  it('regen → tick → status flow', async () => {
    let r = await runBin(['regen']);
    expect(r.code).toBe(0);

    r = await runBin(['new', 'foo']);
    expect(r.code).toBe(0);

    r = await runBin(['tick', 'foo', '1']);
    expect(r.code).toBe(0);

    r = await runBin(['status', '--json']);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.specs[0].name).toBe('foo');
    expect(parsed.data.specs[0].progress).toBe('1/1');
  });

  it('validate exits 1 on validation errors', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'a'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'specs', 'b'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'a', 'requirements.md'), '---\ndepends_on: [b]\n---\n');
    await fs.writeFile(path.join(tmp, 'specs', 'b', 'requirements.md'), '---\ndepends_on: [a]\n---\n');

    const r = await runBin(['validate']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/validation error/i);
  });

  it('serve prints stub error and exits 1', async () => {
    const r = await runBin(['serve']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/v0\.2|Plan 2\.5|not yet implemented/);
  });
});
```

- [ ] **Step 4: Run all CLI tests**

```
pnpm --filter @zettelgeist/cli test
```
Expected: all unit tests + 4 e2e tests pass.

- [ ] **Step 5: Run all package tests + conformance**

```
pnpm -r test
pnpm conformance
pnpm -r typecheck
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): wire bin.ts dispatcher + e2e tests"
```

---

## Phase 3 — `packages/mcp-server/` (Tasks 18–25)

The stdio MCP server. Each tool reads disk via `@zettelgeist/fs-adapters` and (for mutating tools) commits via the same `gitCommit` helper as the CLI.

### Task 18: MCP server scaffold + tool registration mechanism

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/tsconfig.build.json`
- Create: `packages/mcp-server/src/bin.ts` (placeholder)
- Create: `packages/mcp-server/src/server.ts`

- [ ] **Step 1: Create `packages/mcp-server/package.json`**

```json
{
  "name": "@zettelgeist/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "zettelgeist-mcp": "./dist/bin.js"
  },
  "files": ["dist", "SKILL.md"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json && chmod +x dist/bin.js",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@zettelgeist/core": "workspace:*",
    "@zettelgeist/fs-adapters": "workspace:*",
    "zod": "^3.23.0"
  }
}
```

(Pin `@modelcontextprotocol/sdk` to whatever the latest stable major is at execution time. The schema below assumes the v1.x API.)

- [ ] **Step 2: Mirror tsconfig pattern**

`packages/mcp-server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src/**/*", "tests/**/*"]
}
```

`packages/mcp-server/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create placeholder `bin.ts`**

`packages/mcp-server/src/bin.ts`:
```ts
#!/usr/bin/env node
console.error('zettelgeist-mcp v0.1 (Plan 2 in progress)');
```

- [ ] **Step 4: Create `server.ts`** — tool registration scaffolding

`packages/mcp-server/src/server.ts`:

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export interface ToolDef<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<I>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export interface ToolContext {
  /** Repo working directory the server is operating against. */
  cwd: string;
}

export function makeServer(tools: ToolDef<unknown, unknown>[], ctx: ToolContext): Server {
  const server = new Server(
    { name: 'zettelgeist', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`unknown tool: ${req.params.name}`);
    const args = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.handler(args, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  return server;
}

// Minimal Zod-to-JSON-Schema converter — only handles the shapes we actually use.
function zodToJsonSchema(schema: z.ZodSchema): unknown {
  // Implementation detail: there's an `zod-to-json-schema` package, but adding a dep
  // for what we use is overkill. Inline a tiny converter that handles z.object,
  // z.string, z.number, z.boolean, z.array, z.enum, z.optional, z.nullable, z.literal,
  // z.discriminatedUnion, z.record(z.unknown()).
  // ... full implementation in actual code; placeholder annotation here.
  // Returns a JSON Schema for the MCP tools/list response.
  return { type: 'object' };  // refined in real implementation
}
```

NOTE on `zodToJsonSchema`: the real implementation needs to faithfully convert the Zod schemas used by our tools (Plan 2 design §9). This is non-trivial. **Two options:**

- **(a) Add a dep on `zod-to-json-schema`** (small, well-maintained npm package). Easier; the code shrinks to two lines. Accept the dep.
- **(b) Hand-roll a small converter** covering only the Zod constructs we use. ~80 LOC. No new dep but more code to maintain.

For Plan 2 v0.1, **use option (a)** — `zod-to-json-schema`. Add to dependencies:

```json
"zod-to-json-schema": "^3.23.0"
```

And replace the `zodToJsonSchema` function with:

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';
```

- [ ] **Step 5: Install + smoke-build**

```
pnpm install
pnpm --filter @zettelgeist/mcp-server build
```

Expected: `packages/mcp-server/dist/bin.js` exists. Running `node packages/mcp-server/dist/bin.js` prints the placeholder message.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server pnpm-lock.yaml
git commit -m "chore(mcp-server): scaffold package with bin entry + tool registration"
```

---

### Task 19: Read tools — `list_specs`, `read_spec`, `read_spec_file`

**Files:**
- Create: `packages/mcp-server/src/tools/list-specs.ts`
- Create: `packages/mcp-server/src/tools/read-spec.ts`
- Create: `packages/mcp-server/src/tools/read-spec-file.ts`
- Create: `packages/mcp-server/tests/tools/read.test.ts`

The three read-only tools share a common shape: build disk fs, read state, return data. No commits.

- [ ] **Step 1: Write failing tests** — combined for the three read tools

`packages/mcp-server/tests/tools/read.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listSpecsTool } from '../../src/tools/list-specs.js';
import { readSpecTool } from '../../src/tools/read-spec.js';
import { readSpecFileTool } from '../../src/tools/read-spec-file.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-read-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [x] one\n- [ ] two\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('listSpecsTool', () => {
  it('returns one row per spec with derived state', async () => {
    const result = await listSpecsTool.handler({}, { cwd: tmp });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'foo', status: 'in-progress', progress: '1/2', blockedBy: null });
  });
});

describe('readSpecTool', () => {
  it('returns full spec contents', async () => {
    const result = await readSpecTool.handler({ name: 'foo' }, { cwd: tmp });
    expect(result.name).toBe('foo');
    expect(result.requirements).toContain('# foo');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].checked).toBe(true);
  });

  it('throws for unknown spec', async () => {
    await expect(readSpecTool.handler({ name: 'ghost' }, { cwd: tmp })).rejects.toThrow(/no such spec/i);
  });
});

describe('readSpecFileTool', () => {
  it('returns one file content', async () => {
    const result = await readSpecFileTool.handler(
      { name: 'foo', relpath: 'tasks.md' },
      { cwd: tmp },
    );
    expect(result.content).toContain('one');
    expect(result.content).toContain('two');
  });

  it('throws for unknown spec or file', async () => {
    await expect(readSpecFileTool.handler({ name: 'foo', relpath: 'missing.md' }, { cwd: tmp })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/mcp-server test read
```

- [ ] **Step 3: Implement the three tools**

`packages/mcp-server/src/tools/list-specs.ts`:

```ts
import { z } from 'zod';
import { loadAllSpecs, deriveStatus, loadConfig, type Status } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({});
type Output = Array<{ name: string; status: Status; progress: string; blockedBy: string | null }>;

export const listSpecsTool: ToolDef<z.infer<typeof inputSchema>, Output> = {
  name: 'list_specs',
  description: 'List all specs in the repo with derived status, progress, and blockedBy.',
  inputSchema,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const specs = await loadAllSpecs(reader, cfg.config.specsDir);
    const repoState = { claimedSpecs: new Set<string>(), mergedSpecs: new Set<string>() };
    return specs.map((s) => {
      const counted = s.tasks.filter((t) => !t.tags.includes('#skip'));
      const checked = counted.filter((t) => t.checked).length;
      const blockedBy = typeof s.frontmatter.blocked_by === 'string' && s.frontmatter.blocked_by.trim() !== ''
        ? s.frontmatter.blocked_by.trim()
        : null;
      return {
        name: s.name,
        status: deriveStatus(s, repoState),
        progress: `${checked}/${counted.length}`,
        blockedBy,
      };
    });
  },
};
```

`packages/mcp-server/src/tools/read-spec.ts`:

```ts
import { z } from 'zod';
import { loadSpec, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({ name: z.string() });

interface SpecOut {
  name: string;
  frontmatter: Record<string, unknown>;
  requirements: string | null;
  tasks: Array<{ index: number; checked: boolean; text: string; tags: string[] }>;
  handoff: string | null;
  lenses: Record<string, string>;
}

export const readSpecTool: ToolDef<z.infer<typeof inputSchema>, SpecOut> = {
  name: 'read_spec',
  description: 'Read a spec by name, returning all of its files (requirements, tasks, handoff, lenses).',
  inputSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const spec = await loadSpec(reader, args.name, cfg.config.specsDir);
    if (spec.requirements === null && spec.tasks.length === 0 && spec.handoff === null && spec.lenses.size === 0) {
      throw new Error(`no such spec: ${args.name}`);
    }
    return {
      name: spec.name,
      frontmatter: spec.frontmatter as Record<string, unknown>,
      requirements: spec.requirements,
      tasks: spec.tasks.map((t) => ({ index: t.index, checked: t.checked, text: t.text, tags: [...t.tags] })),
      handoff: spec.handoff,
      lenses: Object.fromEntries(spec.lenses),
    };
  },
};
```

`packages/mcp-server/src/tools/read-spec-file.ts`:

```ts
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({ name: z.string(), relpath: z.string() });

export const readSpecFileTool: ToolDef<z.infer<typeof inputSchema>, { content: string }> = {
  name: 'read_spec_file',
  description: 'Read a single file inside a spec by relative path (e.g. tasks.md, lenses/design.md).',
  inputSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const filepath = path.join(ctx.cwd, cfg.config.specsDir, args.name, args.relpath);
    const content = await fs.readFile(filepath, 'utf8');
    return { content };
  },
};
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/mcp-server test read
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): list_specs, read_spec, read_spec_file tools"
```

---

### Task 20: Write tools — `write_spec_file`, `write_handoff`

**Files:**
- Create: `packages/mcp-server/src/tools/write-spec-file.ts`
- Create: `packages/mcp-server/src/tools/write-handoff.ts`
- Create: `packages/mcp-server/tests/tools/write.test.ts`

Both tools: atomic-write the file, regen INDEX, commit.

- [ ] **Step 1: Write failing tests**

`packages/mcp-server/tests/tools/write.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { writeSpecFileTool } from '../../src/tools/write-spec-file.js';
import { writeHandoffTool } from '../../src/tools/write-handoff.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-write-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('writeSpecFileTool', () => {
  it('writes content and produces a commit', async () => {
    const result = await writeSpecFileTool.handler(
      { name: 'foo', relpath: 'requirements.md', content: '# Foo Updated\n' },
      { cwd: tmp },
    );
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const content = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(content).toBe('# Foo Updated\n');
  });
});

describe('writeHandoffTool', () => {
  it('writes handoff.md and commits', async () => {
    const result = await writeHandoffTool.handler(
      { name: 'foo', content: '# Handoff — foo\n\nLast session: did X.\n' },
      { cwd: tmp },
    );
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const content = await fs.readFile(path.join(tmp, 'specs', 'foo', 'handoff.md'), 'utf8');
    expect(content).toContain('Last session: did X.');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/mcp-server test write
```

- [ ] **Step 3: Implement the two tools**

To avoid duplication, factor out a shared helper for atomic write + regen + commit. Place it at `packages/mcp-server/src/util/write-and-commit.ts`:

```ts
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export async function writeFileAndCommit(
  cwd: string,
  fileRelPath: string,
  content: string,
  commitMessage: string,
): Promise<{ commit: string }> {
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);

  const fileAbs = path.join(cwd, fileRelPath);
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  const tmpPath = `${fileAbs}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, fileAbs);

  const result = await runConformance(reader);
  const indexAbs = path.join(cwd, cfg.config.specsDir, 'INDEX.md');
  let onDisk: string | null = null;
  try {
    onDisk = await fs.readFile(indexAbs, 'utf8');
  } catch {
    // missing
  }
  if (onDisk !== result.index) {
    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    const indexTmp = `${indexAbs}.tmp`;
    await fs.writeFile(indexTmp, result.index, 'utf8');
    await fs.rename(indexTmp, indexAbs);
  }

  const indexRel = path.posix.join(cfg.config.specsDir, 'INDEX.md');
  await execFileP('git', ['add', fileRelPath, indexRel], { cwd });
  await execFileP('git', ['commit', '-m', commitMessage], { cwd });
  const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd });
  return { commit: stdout.trim() };
}
```

`packages/mcp-server/src/tools/write-spec-file.ts`:

```ts
import { z } from 'zod';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({
  name: z.string(),
  relpath: z.string(),
  content: z.string(),
});

export const writeSpecFileTool: ToolDef<z.infer<typeof inputSchema>, { commit: string }> = {
  name: 'write_spec_file',
  description: 'Write a file inside a spec, regenerate INDEX.md, and commit.',
  inputSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const fileRel = path.posix.join(cfg.config.specsDir, args.name, args.relpath);
    return writeFileAndCommit(ctx.cwd, fileRel, args.content, `[zg] write: ${args.name}/${args.relpath}`);
  },
};
```

`packages/mcp-server/src/tools/write-handoff.ts`:

```ts
import { z } from 'zod';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({ name: z.string(), content: z.string() });

export const writeHandoffTool: ToolDef<z.infer<typeof inputSchema>, { commit: string }> = {
  name: 'write_handoff',
  description: 'Write the handoff.md for a spec and commit.',
  inputSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const fileRel = path.posix.join(cfg.config.specsDir, args.name, 'handoff.md');
    return writeFileAndCommit(ctx.cwd, fileRel, args.content, `[zg] handoff: ${args.name}`);
  },
};
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/mcp-server test write
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): write_spec_file and write_handoff tools"
```

---

### Task 21: Tick tools — `tick_task`, `untick_task`

**Files:**
- Create: `packages/mcp-server/src/tools/tick-task.ts`
- Create: `packages/mcp-server/tests/tools/tick.test.ts`

Reuses the regex-based checkbox flip from the CLI's `tick.ts`. Factor that into a shared helper if possible — or duplicate the small regex (4 lines).

- [ ] **Step 1: Write failing tests** (mirror the CLI's tick tests, simplified)

`packages/mcp-server/tests/tools/tick.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { tickTaskTool, untickTaskTool } from '../../src/tools/tick-task.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-tick-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [ ] 1. one\n- [ ] 2. two\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('tickTaskTool', () => {
  it('flips n=1 to checked', async () => {
    const result = await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const tasks = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(tasks.split('\n')[0]).toContain('[x]');
  });

  it('rejects out-of-range n', async () => {
    await expect(tickTaskTool.handler({ name: 'foo', n: 99 }, { cwd: tmp })).rejects.toThrow(/no task at index/i);
  });
});

describe('untickTaskTool', () => {
  it('flips a checked box back to unchecked', async () => {
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [x] 1. one\n');
    await execFileP('git', ['add', '.'], { cwd: tmp });
    await execFileP('git', ['commit', '-q', '-m', 'tick'], { cwd: tmp });

    const result = await untickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const tasks = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(tasks.split('\n')[0]).toContain('[ ]');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/mcp-server test tick
```

- [ ] **Step 3: Implement**

`packages/mcp-server/src/tools/tick-task.ts`:

```ts
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
import type { ToolDef } from '../server.js';

const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+.*)$/;
const inputSchema = z.object({ name: z.string(), n: z.number().int().positive() });

async function tickOrUntick(
  cwd: string,
  name: string,
  n: number,
  checked: boolean,
): Promise<{ commit: string }> {
  const reader = makeDiskFsReader(cwd);
  const cfg = await loadConfig(reader);
  const tasksRel = path.posix.join(cfg.config.specsDir, name, 'tasks.md');
  const tasksAbs = path.join(cwd, tasksRel);
  const body = await fs.readFile(tasksAbs, 'utf8');
  const lines = body.split('\n');
  let count = 0;
  let mutated = false;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i]?.match(TASK_LINE);
    if (!m) continue;
    count += 1;
    if (count === n) {
      lines[i] = m[1] + (checked ? 'x' : ' ') + m[3];
      mutated = true;
      break;
    }
  }
  if (!mutated) throw new Error(`no task at index ${n} in ${name}`);
  const op = checked ? 'tick' : 'untick';
  return writeFileAndCommit(cwd, tasksRel, lines.join('\n'), `[zg] ${op}: ${name}#${n}`);
}

export const tickTaskTool: ToolDef<z.infer<typeof inputSchema>, { commit: string }> = {
  name: 'tick_task',
  description: 'Tick the task at the given index in the spec\'s tasks.md.',
  inputSchema,
  async handler(args, ctx) {
    return tickOrUntick(ctx.cwd, args.name, args.n, true);
  },
};

export const untickTaskTool: ToolDef<z.infer<typeof inputSchema>, { commit: string }> = {
  name: 'untick_task',
  description: 'Untick the task at the given index in the spec\'s tasks.md.',
  inputSchema,
  async handler(args, ctx) {
    return tickOrUntick(ctx.cwd, args.name, args.n, false);
  },
};
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/mcp-server test tick
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): tick_task and untick_task tools"
```

---

### Task 22: Status / claim / install-hook tools

**Files:**
- Create: `packages/mcp-server/src/tools/set-status.ts`
- Create: `packages/mcp-server/src/tools/claim-spec.ts` (handles claim and release)
- Create: `packages/mcp-server/src/tools/install-git-hook.ts`
- Create: `packages/mcp-server/tests/tools/state.test.ts`

These three combine three smaller tool concerns into one task because the implementations are small and parallel to existing CLI commands.

- [ ] **Step 1: Write failing tests** — combined

`packages/mcp-server/tests/tools/state.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { setStatusTool } from '../../src/tools/set-status.js';
import { claimSpecTool, releaseSpecTool } from '../../src/tools/claim-spec.js';
import { installGitHookTool } from '../../src/tools/install-git-hook.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-state-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('setStatusTool', () => {
  it('writes status and reason to frontmatter', async () => {
    const result = await setStatusTool.handler(
      { name: 'foo', status: 'blocked', reason: 'waiting on creds' },
      { cwd: tmp },
    );
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const reqs = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(reqs).toContain('status: blocked');
    expect(reqs).toContain('blocked_by: waiting on creds');
  });

  it('clears status when null', async () => {
    await setStatusTool.handler({ name: 'foo', status: 'blocked', reason: 'r' }, { cwd: tmp });
    const result = await setStatusTool.handler({ name: 'foo', status: null }, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const reqs = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(reqs).not.toContain('status: blocked');
  });
});

describe('claim/release', () => {
  it('claim writes .claim, release removes it', async () => {
    await claimSpecTool.handler({ name: 'foo', agent_id: 'a@b' }, { cwd: tmp });
    expect(await fs.access(path.join(tmp, 'specs', 'foo', '.claim')).then(() => true).catch(() => false)).toBe(true);

    await releaseSpecTool.handler({ name: 'foo' }, { cwd: tmp });
    expect(await fs.access(path.join(tmp, 'specs', 'foo', '.claim')).then(() => true).catch(() => false)).toBe(false);
  });
});

describe('install_git_hook', () => {
  it('installs the marker block', async () => {
    await installGitHookTool.handler({}, { cwd: tmp });
    const hook = await fs.readFile(path.join(tmp, '.git', 'hooks', 'pre-commit'), 'utf8');
    expect(hook).toContain('# >>> zettelgeist >>>');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/mcp-server test state
```

- [ ] **Step 3: Implement**

`packages/mcp-server/src/tools/set-status.ts`:

```ts
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import matter from 'gray-matter';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { writeFileAndCommit } from '../util/write-and-commit.js';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({
  name: z.string(),
  status: z.enum(['blocked', 'cancelled']).nullable(),
  reason: z.string().optional(),
});

export const setStatusTool: ToolDef<z.infer<typeof inputSchema>, { commit: string }> = {
  name: 'set_status',
  description: 'Set the status frontmatter override on a spec (blocked/cancelled), or clear it (null).',
  inputSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const reqRel = path.posix.join(cfg.config.specsDir, args.name, 'requirements.md');
    const reqAbs = path.join(ctx.cwd, reqRel);

    const raw = await fs.readFile(reqAbs, 'utf8').catch(() => '');
    const parsed = matter(raw, {});
    const data = { ...(parsed.data ?? {}) } as Record<string, unknown>;

    if (args.status === null) {
      delete data.status;
      delete data.blocked_by;
    } else {
      data.status = args.status;
      if (args.reason !== undefined) {
        data.blocked_by = args.reason;
      }
    }

    const newFrontmatter = Object.keys(data).length > 0 ? `---\n${yaml.dump(data)}---\n` : '';
    const body = parsed.content;
    const newContent = newFrontmatter + (body.startsWith('\n') ? body.slice(1) : body);

    return writeFileAndCommit(ctx.cwd, reqRel, newContent, `[zg] set-status: ${args.name}`);
  },
};
```

`packages/mcp-server/src/tools/claim-spec.ts`:

```ts
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const claimSchema = z.object({ name: z.string(), agent_id: z.string().optional() });
const releaseSchema = z.object({ name: z.string() });

export const claimSpecTool: ToolDef<z.infer<typeof claimSchema>, { acknowledged: true }> = {
  name: 'claim_spec',
  description: 'Write a .claim file for a spec (ephemeral, gitignored).',
  inputSchema: claimSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const dir = path.join(ctx.cwd, cfg.config.specsDir, args.name);
    const agentId = args.agent_id ?? 'agent';
    const ts = new Date().toISOString();
    await fs.writeFile(path.join(dir, '.claim'), `${agentId}\n${ts}\n`, 'utf8');
    return { acknowledged: true };
  },
};

export const releaseSpecTool: ToolDef<z.infer<typeof releaseSchema>, { acknowledged: true }> = {
  name: 'release_spec',
  description: 'Remove the .claim file for a spec.',
  inputSchema: releaseSchema,
  async handler(args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const claimPath = path.join(ctx.cwd, cfg.config.specsDir, args.name, '.claim');
    await fs.unlink(claimPath).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
    return { acknowledged: true };
  },
};
```

`packages/mcp-server/src/tools/install-git-hook.ts`:

```ts
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { ToolDef } from '../server.js';

const execFileP = promisify(execFile);
const inputSchema = z.object({ force: z.boolean().optional() });

const HOOK_MARKER_BEGIN = '# >>> zettelgeist >>>';
const HOOK_MARKER_END = '# <<< zettelgeist <<<';
const HOOK_BLOCK = `${HOOK_MARKER_BEGIN}\nzettelgeist regen --check\n${HOOK_MARKER_END}`;

export const installGitHookTool: ToolDef<z.infer<typeof inputSchema>, { acknowledged: true }> = {
  name: 'install_git_hook',
  description: 'Install the pre-commit hook (smart-merge with markers).',
  inputSchema,
  async handler(args, ctx) {
    const { stdout } = await execFileP('git', ['rev-parse', '--show-toplevel'], { cwd: ctx.cwd });
    const repoRoot = stdout.trim();
    const hookDir = path.join(repoRoot, '.git', 'hooks');
    await fs.mkdir(hookDir, { recursive: true });
    const hookPath = path.join(hookDir, 'pre-commit');
    let existing: string | null = null;
    try {
      existing = await fs.readFile(hookPath, 'utf8');
    } catch {
      // missing
    }
    if (existing === null || existing.trim() === '') {
      await fs.writeFile(hookPath, HOOK_BLOCK + '\n', 'utf8');
    } else if (existing.includes(HOOK_MARKER_BEGIN) && existing.includes(HOOK_MARKER_END)) {
      // Already installed; idempotent.
    } else if (args.force) {
      await fs.writeFile(`${hookPath}.before-zettelgeist`, existing, 'utf8');
      await fs.writeFile(hookPath, HOOK_BLOCK + '\n', 'utf8');
    } else {
      throw new Error('pre-commit hook contains non-marker content; pass force: true to overwrite');
    }
    await fs.chmod(hookPath, 0o755);
    return { acknowledged: true };
  },
};
```

Note: this duplicates some logic with `packages/cli/src/git.ts:installPreCommitHook`. Acceptable for v0.1 — both implementations should stay in sync, but they're each ~30 LOC. If divergence becomes a maintenance issue, extract into a shared package.

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/mcp-server test state
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): set_status, claim/release, install_git_hook tools"
```

---

### Task 23: Regen + validate tools

**Files:**
- Create: `packages/mcp-server/src/tools/regenerate-index.ts`
- Create: `packages/mcp-server/src/tools/validate-repo.ts`
- Create: `packages/mcp-server/tests/tools/regen-validate.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/mcp-server/tests/tools/regen-validate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { regenerateIndexTool } from '../../src/tools/regenerate-index.js';
import { validateRepoTool } from '../../src/tools/validate-repo.js';

const execFileP = promisify(execFile);

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-rv-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('regenerateIndexTool', () => {
  it('writes INDEX.md and commits when there is a change', async () => {
    const result = await regenerateIndexTool.handler({}, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const idx = await fs.readFile(path.join(tmp, 'specs', 'INDEX.md'), 'utf8');
    expect(idx).toContain('_No specs._');
  });

  it('returns null commit when no change', async () => {
    await regenerateIndexTool.handler({}, { cwd: tmp });
    const result = await regenerateIndexTool.handler({}, { cwd: tmp });
    expect(result.commit).toBeNull();
  });
});

describe('validateRepoTool', () => {
  it('returns empty errors for a healthy repo', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    const result = await validateRepoTool.handler({}, { cwd: tmp });
    expect(result.errors).toEqual([]);
  });

  it('returns E_CYCLE for a depends_on cycle', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'a'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'specs', 'b'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'a', 'requirements.md'), '---\ndepends_on: [b]\n---\n');
    await fs.writeFile(path.join(tmp, 'specs', 'b', 'requirements.md'), '---\ndepends_on: [a]\n---\n');
    const result = await validateRepoTool.handler({}, { cwd: tmp });
    expect(result.errors.some((e) => e.code === 'E_CYCLE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```
pnpm --filter @zettelgeist/mcp-server test regen-validate
```

- [ ] **Step 3: Implement**

`packages/mcp-server/src/tools/regenerate-index.ts`:

```ts
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runConformance, loadConfig } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const execFileP = promisify(execFile);
const inputSchema = z.object({});

export const regenerateIndexTool: ToolDef<z.infer<typeof inputSchema>, { commit: string | null }> = {
  name: 'regenerate_index',
  description: 'Regenerate INDEX.md and commit if there is a change. Returns null commit if no change.',
  inputSchema,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const result = await runConformance(reader);
    const indexAbs = path.join(ctx.cwd, cfg.config.specsDir, 'INDEX.md');
    let onDisk: string | null = null;
    try {
      onDisk = await fs.readFile(indexAbs, 'utf8');
    } catch {
      // missing
    }
    if (onDisk === result.index) return { commit: null };

    await fs.mkdir(path.dirname(indexAbs), { recursive: true });
    const tmp = `${indexAbs}.tmp`;
    await fs.writeFile(tmp, result.index, 'utf8');
    await fs.rename(tmp, indexAbs);

    const indexRel = path.posix.join(cfg.config.specsDir, 'INDEX.md');
    await execFileP('git', ['add', indexRel], { cwd: ctx.cwd });
    await execFileP('git', ['commit', '-m', '[zg] regen'], { cwd: ctx.cwd });
    const { stdout } = await execFileP('git', ['rev-parse', 'HEAD'], { cwd: ctx.cwd });
    return { commit: stdout.trim() };
  },
};
```

`packages/mcp-server/src/tools/validate-repo.ts`:

```ts
import { z } from 'zod';
import { validateRepo, loadConfig, type ValidationError } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import type { ToolDef } from '../server.js';

const inputSchema = z.object({});

export const validateRepoTool: ToolDef<z.infer<typeof inputSchema>, { errors: ValidationError[] }> = {
  name: 'validate_repo',
  description: 'Run validateRepo and return the list of validation errors (E_CYCLE, E_INVALID_FRONTMATTER, E_EMPTY_SPEC).',
  inputSchema,
  async handler(_args, ctx) {
    const reader = makeDiskFsReader(ctx.cwd);
    const cfg = await loadConfig(reader);
    const validation = await validateRepo(reader, cfg.config.specsDir);
    return { errors: [...cfg.errors, ...validation.errors] };
  },
};
```

- [ ] **Step 4: Run tests — expect pass**

```
pnpm --filter @zettelgeist/mcp-server test regen-validate
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): regenerate_index and validate_repo tools"
```

---

### Task 24: SKILL.md

**Files:**
- Create: `packages/mcp-server/SKILL.md`

- [ ] **Step 1: Write the SKILL.md** — exact content:

```markdown
---
name: zettelgeist
description: Stateful agent surface for Zettelgeist — markdown-based spec-driven project management. Lists, reads, mutates specs in any Zettelgeist repo via standard MCP tools.
---

# zettelgeist MCP server

## When to use

You're operating in a repository that contains a `.zettelgeist.yaml` file. Specs are folders under the configured `specs_dir` (default `specs/`). Use these tools to read state and make commits to spec files.

## Requirements

- Node 20+, the `zettelgeist-mcp` binary installed.
- The repo has been initialized as a Zettelgeist repo (commit `.zettelgeist.yaml` manually, or run `zettelgeist new <spec>` after setting up the file).

## Agent guidance

- **Prefer `list_specs` first** to understand what's in the repo before reading individual specs.
- **Always claim before mutating**: `claim_spec` writes a `.claim` file; release on completion.
- **Never edit `INDEX.md` directly**: it's regenerated. Edit `requirements.md`, `tasks.md`, etc., and the next regen picks up changes.
- **Use machine-readable error codes**: `E_CYCLE`, `E_INVALID_FRONTMATTER`, `E_EMPTY_SPEC` are the v0.1 codes. Check `validate_repo` before assuming a write succeeded.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `list_specs` | — | array of `{name, status, progress, blockedBy}` |
| `read_spec` | `{name}` | full spec contents (all files) |
| `read_spec_file` | `{name, relpath}` | one file's content |
| `write_spec_file` | `{name, relpath, content}` | new commit SHA |
| `tick_task` | `{name, n}` | new commit SHA |
| `untick_task` | `{name, n}` | new commit SHA |
| `set_status` | `{name, status, reason?}` | new commit SHA |
| `claim_spec` | `{name, agent_id?}` | acknowledged |
| `release_spec` | `{name}` | acknowledged |
| `write_handoff` | `{name, content}` | new commit SHA |
| `regenerate_index` | — | new commit SHA (or null if no change) |
| `validate_repo` | — | array of validation errors |
| `install_git_hook` | `{force?}` | acknowledged |

## Examples

**Claim a spec, tick three tasks, write a handoff, release:**

```
list_specs                                    → see what's in the repo
read_spec({name: "user-auth"})                → understand the task list
claim_spec({name: "user-auth", agent_id: "agent-1"})
tick_task({name: "user-auth", n: 1})
tick_task({name: "user-auth", n: 2})
tick_task({name: "user-auth", n: 3})
write_handoff({name: "user-auth", content: "..."})
release_spec({name: "user-auth"})
```

**Mark a spec as blocked with a reason:**

```
set_status({name: "payment-flow", status: "blocked", reason: "waiting on IDP creds"})
```

**Clear an explicit status override:**

```
set_status({name: "payment-flow", status: null})
```

## Error model

Tool errors return an MCP error response with the underlying error message. For format-layer errors (cycles, invalid frontmatter, empty specs), the validation result includes a structured array per the table above.
```

- [ ] **Step 2: Verify rendering**

```
head -30 packages/mcp-server/SKILL.md
```

Expected: see the YAML frontmatter and section structure.

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server/SKILL.md
git commit -m "docs(mcp-server): add SKILL.md agent manifest"
```

---

### Task 25: Wire `bin.ts` + e2e test

**Files:**
- Modify: `packages/mcp-server/src/bin.ts`
- Create: `packages/mcp-server/tests/e2e.test.ts`

- [ ] **Step 1: Replace `bin.ts`**

`packages/mcp-server/src/bin.ts`:

```ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { makeServer } from './server.js';
import { listSpecsTool } from './tools/list-specs.js';
import { readSpecTool } from './tools/read-spec.js';
import { readSpecFileTool } from './tools/read-spec-file.js';
import { writeSpecFileTool } from './tools/write-spec-file.js';
import { writeHandoffTool } from './tools/write-handoff.js';
import { tickTaskTool, untickTaskTool } from './tools/tick-task.js';
import { setStatusTool } from './tools/set-status.js';
import { claimSpecTool, releaseSpecTool } from './tools/claim-spec.js';
import { regenerateIndexTool } from './tools/regenerate-index.js';
import { validateRepoTool } from './tools/validate-repo.js';
import { installGitHookTool } from './tools/install-git-hook.js';

const tools = [
  listSpecsTool,
  readSpecTool,
  readSpecFileTool,
  writeSpecFileTool,
  writeHandoffTool,
  tickTaskTool,
  untickTaskTool,
  setStatusTool,
  claimSpecTool,
  releaseSpecTool,
  regenerateIndexTool,
  validateRepoTool,
  installGitHookTool,
];

async function main(): Promise<void> {
  const server = makeServer(tools as never, { cwd: process.cwd() });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('zettelgeist-mcp fatal:', err);
  process.exit(1);
});
```

The `as never` cast is needed because the tool array is heterogeneously typed; the makeServer signature uses `ToolDef<unknown, unknown>[]` for ergonomics. If the typecheck rejects this, change `makeServer`'s signature to accept `readonly ToolDef<any, any>[]`.

- [ ] **Step 2: Build the MCP server**

```
pnpm --filter @zettelgeist/mcp-server build
```

Verify `packages/mcp-server/dist/bin.js` is executable.

- [ ] **Step 3: Write e2e test**

`packages/mcp-server/tests/e2e.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(here, '..', 'dist', 'bin.js');

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-e2e-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function sendJsonRpc(proc: ReturnType<typeof spawn>, request: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const newlineIdx = buffer.indexOf('\n');
      if (newlineIdx === -1) return;
      const line = buffer.slice(0, newlineIdx);
      proc.stdout?.off('data', onData);
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(err);
      }
    };
    proc.stdout?.on('data', onData);
    proc.stdin?.write(JSON.stringify(request) + '\n');
    setTimeout(() => reject(new Error('timeout')), 5000);
  });
}

describe('mcp-server e2e', () => {
  it('responds to tools/list over stdio', async () => {
    const proc = spawn('node', [BIN], { cwd: tmp, stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const response = (await sendJsonRpc(proc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      })) as { result: { tools: Array<{ name: string }> } };

      const toolNames = response.result.tools.map((t) => t.name);
      expect(toolNames).toContain('list_specs');
      expect(toolNames).toContain('tick_task');
      expect(toolNames).toContain('install_git_hook');
      expect(toolNames.length).toBe(13);
    } finally {
      proc.kill();
    }
  });
});
```

- [ ] **Step 4: Run all MCP-server tests**

```
pnpm --filter @zettelgeist/mcp-server test
```
Expected: all unit tests + 1 e2e pass.

- [ ] **Step 5: Run all package tests**

```
pnpm -r test
pnpm conformance
pnpm -r typecheck
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server
git commit -m "feat(mcp-server): wire bin.ts dispatcher + e2e test"
```

---

## Phase 4 — CI + Husky + finish (Tasks 26–28)

### Task 26: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm -r typecheck

      - run: pnpm -r test

      - run: pnpm conformance

      - run: pnpm --filter @zettelgeist/cli build

      - name: regen --check
        run: node packages/cli/dist/bin.js regen --check
```

- [ ] **Step 2: Commit**

```bash
git add .github
git commit -m "ci: add GitHub Actions workflow (typecheck + test + conformance + regen check)"
```

This will run on the next push to main / on PRs. Locally, you can verify it parses by running `act` if installed (optional).

---

### Task 27: Husky template

**Files:**
- Create: `.husky/pre-commit`

- [ ] **Step 1: Write the husky template**

`.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Zettelgeist pre-commit hook (husky variant)
# Users with husky already wired up can use this directly.
# Users without husky should run `zettelgeist install-hook` to get
# a hook in `.git/hooks/pre-commit` directly.

pnpm dlx zettelgeist regen --check
```

- [ ] **Step 2: Set executable bit**

```
chmod +x .husky/pre-commit
```

- [ ] **Step 3: Commit**

```bash
git add .husky
git commit -m "chore: add husky pre-commit template"
```

---

### Task 28: Final verification + dogfood `zettelgeist install-hook`

- [ ] **Step 1: Run all tests + typecheck + conformance + regen check**

```
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm conformance
pnpm --filter @zettelgeist/cli build
node packages/cli/dist/bin.js regen --check
```

Expected: all green.

- [ ] **Step 2: Dogfood — install the pre-commit hook on this repo**

```
node packages/cli/dist/bin.js install-hook
```

Verify: `.git/hooks/pre-commit` exists with the marker block.

- [ ] **Step 3: Verify the hook actually runs by creating a small change**

```
echo "" >> README.md
git add README.md
git commit -m "test: verify hook runs"
```

Expected: hook runs `regen --check`, exits 0 (no changes to specs/), commit succeeds.

If the hook is causing issues, debug; otherwise revert the README change:
```
git reset --soft HEAD~1
git restore --staged README.md
git checkout README.md
```

- [ ] **Step 4: Final commit (if anything changed)**

If anything in the dogfood step changed (e.g., INDEX.md was stale and got updated), commit it:

```
git add -u
git commit -m "chore: dogfood install-hook on the zettelgeist repo"
```

If nothing changed, no commit needed.

---

## Self-review checklist (run after Task 28)

- [ ] All ~30 unit tests across new packages passing (~10 fs-adapters + ~30 cli + ~15 mcp-server = ~55 new tests).
- [ ] All 11 conformance fixtures still passing.
- [ ] `pnpm -r typecheck` clean.
- [ ] `node packages/cli/dist/bin.js --help` prints help.
- [ ] `node packages/cli/dist/bin.js regen --check` exits 0 against this repo.
- [ ] `node packages/mcp-server/dist/bin.js` runs (will block waiting for stdio JSON-RPC; Ctrl+C to exit).
- [ ] `.git/hooks/pre-commit` contains the marker block.
- [ ] No secrets, .env files, or credentials committed.

If anything fails, fix it inline. Do not move to Plan 2.5 until all checks pass.

---

## What ships when this plan is done

- `packages/fs-adapters/` — shared FsReader implementations (disk + memory).
- `packages/cli/` — `zettelgeist` Node CLI binary with 10 commands (regen, validate, new, tick, untick, claim, release, status, install-hook, serve-stub).
- `packages/mcp-server/` — `zettelgeist-mcp` stdio MCP server with 13 tools.
- `packages/mcp-server/SKILL.md` — agent-readable manifest.
- `.github/workflows/ci.yml` — typecheck + test + conformance + regen check on push/PR.
- `.husky/pre-commit` — template for husky users.
- The repo's own `.git/hooks/pre-commit` — installed via `zettelgeist install-hook`.

What's still missing for a full v0.1 (covered by Plan 2.5 + Plans 3–4):

- **Plan 2.5**: Bundled HTML viewer (single template) + `zettelgeist serve` populated; theme selection layer.
- **Plan 3**: VSCode extension — tree view + commands + file watcher (smallest useful editor surface).
- **Plan 4**: VSCode extension — Kanban + spec detail webviews (full v0.1 UI). May be deprioritized if Plan 2.5's web viewer covers the non-coder thesis well enough.
