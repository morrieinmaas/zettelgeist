# Zettelgeist v0.1 — Plan 2 Design

- **Status:** Draft
- **Date:** 2026-05-09
- **Author:** Mo
- **Topic:** MCP server + CLI binary + pre-commit hook + CI workflow
- **Builds on:** Plan 1 (format core + spec doc + conformance fixtures, complete)

## 1. Summary

Plan 2 ships the two surface artifacts that turn Plan 1's format core into something users can actually run: a Node CLI (`zettelgeist`) for human-and-script-driven operations, and an MCP server (`zettelgeist-mcp`) for agent-driven operations. Both surfaces share `@zettelgeist/core` and use the same disk-backed `FsReader`. A pre-commit hook installer keeps `INDEX.md` fresh on every commit. A GitHub Actions workflow gates merges on type checks, tests, conformance, and a `regen --check` against the repo.

Plan 2 also locks in the architectural shape of HTML rendering — a tool-bundled viewer, opt-in customization, content-as-data — without implementing it. That work lands in Plan 2.5.

## 2. Goals (in scope for Plan 2)

- **`packages/fs-adapters/`** — shared package exporting `makeDiskFsReader` and `makeMemFsReader`. Replaces ad-hoc duplications in tests and conformance harness.
- **`packages/cli/`** — npm package `zettelgeist` with a `bin` entry. Commands: `regen`, `validate`, `new`, `tick`, `untick`, `claim`, `release`, `status`, `install-hook`, plus a stub `serve`. Uses Node's built-in `parseArgs` plus a small subcommand router; no external CLI library dependency.
- **`packages/mcp-server/`** — npm package `zettelgeist-mcp` with a `bin` entry. Stdio-only MCP transport. Tool surface as defined in Plan 1's design §6.2. Uses `@modelcontextprotocol/sdk`.
- **`SKILL.md`** at `packages/mcp-server/SKILL.md` — agent-readable manifest in the CLI-Anything pattern. YAML frontmatter (`name`, `description`) + standard sections (Purpose, Requirements, Agent Guidance, Tools, Examples). Bundled in the published package.
- **Pre-commit hook installer** — implemented in `packages/cli/`, invoked via `zettelgeist install-hook`. Smart-merge with `# >>> zettelgeist >>>` / `# <<< zettelgeist <<<` markers. Idempotent; refuses to clobber non-marker hooks unless `--force`.
- **Husky template** — committed at `.husky/pre-commit` for users who already use husky. NOT auto-installed via `package.json` prepare script.
- **CI workflow** at `.github/workflows/ci.yml` — `pnpm install` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm conformance` → `node packages/cli/dist/bin.js regen --check`. Triggers on push to main and on pull_request.
- **`--json` output flag** on every CLI command, with a documented envelope shape: `{ok: true, data: T} | {ok: false, error: {message, detail?}}`. Without `--json`, output is human-readable.

## 3. Non-goals (deferred to v0.2+)

- VSCode extension (Plans 3–4).
- HTTP/SSE MCP transports.
- Stateful REPL mode (`zettelgeist repl`) — defer to v0.3; subcommands cover the same surface.
- Agent loop orchestration (per Plan 1's design).
- Events / webhooks.
- Suggestion-branch contribution flow.
- Multi-repo specs.
- **HTML rendering / viewer** — `zettelgeist serve` ships in Plan 2 as a stub only. Full viewer is Plan 2.5.
- **Rust port of the CLI** — possible v0.2/v0.3, conformance fixtures will be the contract.

## 4. Architecture

Three new workspace packages, all sharing `@zettelgeist/core` as their dependency. Same pnpm monorepo, same toolchain.

```
+-----------------------+   +-----------------------+
| packages/cli/         |   | packages/mcp-server/  |
| `zettelgeist` bin     |   | `zettelgeist-mcp` bin |
+----------+------------+   +-----------+-----------+
           |                            |
           | imports core               | imports core
           +-------------+ +------------+
                         | |
                  +------v-v------+
                  | @zettelgeist/ |
                  |     core      |  (unchanged)
                  +-------+-------+
                          |
                          v
                   filesystem (specs/)

  Pre-commit hook  →  `zettelgeist regen --check`        (subprocess of git)
  CI workflow      →  pnpm install + typecheck + tests
                       + `zettelgeist regen --check`     (subprocess of GHA)
  MCP client       →  `zettelgeist-mcp`                  (subprocess of agent host)
```

**Key invariants:**

- `core` stays unchanged from Plan 1. No I/O, pure functions, injected `FsReader`.
- Both new surface packages call `core` for all derivation. No status logic anywhere else.
- Both use the disk-backed `FsReader` from the shared `fs-adapters` package.
- Every code path that calls regen (CLI mutating commands, MCP mutating tools, pre-commit hook in `--check` mode) calls **the same regen function** in `core`. The CLI mutating commands and MCP mutating tools also produce git commits with a uniform message format (`[zg] <op>: <spec>`). The pre-commit hook never writes — it only reads via `--check` and either approves or blocks the user's commit (see §7).
- The MCP server is **stateless across calls**. Each tool invocation reads the filesystem fresh; `.claim` files are the only ephemeral state and live on disk (gitignored).

**Three external surface artifacts** (npm-installable):

1. `zettelgeist` (CLI) — published from `packages/cli/`
2. `zettelgeist-mcp` (MCP server) — published from `packages/mcp-server/`
3. (still) the existing internal `@zettelgeist/core` — not published; bundled into the above

For v0.1 we don't actually publish to npm yet (that's v0.2+ when format stabilizes). The bin entries work via `pnpm link`, `pnpm dlx`, or installation from a tarball.

## 5. Repo layout updates

```
zettelgeist/
├── packages/
│   ├── core/                    (unchanged)
│   ├── fs-adapters/             ← NEW
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── src/
│   │   │   ├── index.ts         # exports makeDiskFsReader, makeMemFsReader
│   │   │   ├── disk.ts
│   │   │   └── mem.ts           # extracted from current test helpers (DRY)
│   │   └── tests/
│   │       └── disk.test.ts     # uses node:fs/promises against a tmpdir
│   ├── cli/                     ← NEW
│   │   ├── package.json         # has "bin": { "zettelgeist": "./dist/bin.js" }
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── src/
│   │   │   ├── bin.ts           # shebang entry; parses argv, dispatches
│   │   │   ├── router.ts        # subcommand routing on top of parseArgs
│   │   │   ├── output.ts        # --json envelope helpers
│   │   │   ├── git.ts           # git subprocess helpers (commit, hook install)
│   │   │   └── commands/
│   │   │       ├── regen.ts
│   │   │       ├── validate.ts
│   │   │       ├── new.ts
│   │   │       ├── tick.ts
│   │   │       ├── untick.ts
│   │   │       ├── claim.ts
│   │   │       ├── release.ts
│   │   │       ├── status.ts
│   │   │       ├── install-hook.ts
│   │   │       └── serve.ts     # stub for v0.1; real viewer in Plan 2.5
│   │   └── tests/
│   │       ├── output.test.ts
│   │       ├── install-hook.test.ts
│   │       └── e2e.test.ts      # spawns the bin against tmpdir repos
│   └── mcp-server/              ← NEW
│       ├── package.json         # "bin": { "zettelgeist-mcp": "./dist/bin.js" }
│       ├── tsconfig.json
│       ├── tsconfig.build.json
│       ├── SKILL.md             # agent-readable manifest
│       ├── src/
│       │   ├── bin.ts           # shebang entry; spawns server on stdio
│       │   ├── server.ts        # MCP server setup, tool registration
│       │   └── tools/
│       │       ├── list-specs.ts
│       │       ├── read-spec.ts
│       │       ├── read-spec-file.ts
│       │       ├── write-spec-file.ts
│       │       ├── tick-task.ts
│       │       ├── untick-task.ts
│       │       ├── set-status.ts
│       │       ├── claim-spec.ts
│       │       ├── release-spec.ts
│       │       ├── write-handoff.ts
│       │       ├── regenerate-index.ts
│       │       ├── validate-repo.ts
│       │       └── install-git-hook.ts
│       └── tests/
│           ├── tools/*.test.ts  # in-process unit tests per tool
│           └── e2e.test.ts      # subprocess + real stdio JSON-RPC
├── spec/conformance/harness/    (consumes @zettelgeist/fs-adapters)
├── .github/workflows/
│   └── ci.yml                   ← NEW
├── .husky/                      ← NEW (template, not auto-installed)
│   └── pre-commit               # contains: pnpm dlx zettelgeist regen --check
└── (rest unchanged)
```

## 6. Components

### 6.1 `packages/fs-adapters/`

Smallest of the three; lands first.

```ts
// disk.ts
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
    async readFile(p) { return fs.readFile(resolve(p), 'utf8'); },
    async exists(p) {
      try { await fs.stat(resolve(p)); return true; } catch { return false; }
    },
  };
}

// mem.ts — extracted from loader.test.ts/validate.test.ts duplication
export function makeMemFsReader(files: Record<string, string>): FsReader { /* ... */ }
```

The `core` package's existing `loader.test.ts` and `validate.test.ts` then import `makeMemFsReader` instead of duplicating it. The conformance harness's `src/run.ts` becomes a one-liner re-export.

### 6.2 `packages/cli/`

- **`bin.ts`** — node shebang, calls `parseArgs` from `node:util`, dispatches to commands. ~80 LOC including the small router we hand-roll.
- **`router.ts`** — maps argv to commands. Generates `--help` text from a static command registry. Maps unknown commands to `cli/unknown-command` errors.
- **`output.ts`** — JSON envelope:
  ```ts
  type Envelope<T> =
    | { ok: true;  data: T }
    | { ok: false; error: { message: string; detail?: unknown } };

  function emit<T>(json: boolean, env: Envelope<T>, humanRender: () => string): void;
  ```
  `--json` is a global flag inherited by subcommands. Without `--json`, output is human-readable.
- **`git.ts`** — wraps `child_process.execFile('git', ...)`. Exposes `gitCommit(message, files)`, `gitDefaultBranch()`, `gitMergedSpecs(specsDir)`, `installPreCommitHook(content, force)`.
- **`commands/`** — one module per command. Each exports a handler `(args, fs, opts) => Promise<Envelope<T>>`. Handlers don't print directly; they return envelopes; `bin.ts` does the emission.

### 6.3 `packages/mcp-server/`

Uses `@modelcontextprotocol/sdk` (the official TypeScript SDK).

- **`bin.ts`** — shebang entry. Imports `Server` from MCP SDK, creates one with name `zettelgeist`, registers tools, connects to `StdioServerTransport`.
- **`server.ts`** — tool registration. Each tool's input schema is a Zod schema (the SDK's expected format).
- **`tools/`** — one file per tool. Pure handler functions: `(args, ctx) => Promise<result>`. `ctx` includes the `FsReader` (disk-backed) and a `gitWriter` for the commit step.

Every mutating tool produces exactly one git commit. The tool handler atomically writes the file → calls `regenerateIndex` → `git add` both → `git commit -m "[zg] <op>: <spec>"`.

### 6.4 `SKILL.md`

Lives at `packages/mcp-server/SKILL.md`, gets bundled into the npm package via `files` field. Structure (CLI-Anything pattern):

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
- The repo has been initialized as a Zettelgeist repo (commit `.zettelgeist.yaml` manually).

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
| `claim_spec` | `{name, agent_id}` | acknowledged |
| `release_spec` | `{name}` | acknowledged |
| `write_handoff` | `{name, content}` | new commit SHA |
| `regenerate_index` | — | new commit SHA (or null if no change) |
| `validate_repo` | — | array of validation errors |
| `install_git_hook` | `{force?}` | acknowledged |

## Examples
[short, concrete walkthroughs — agent claims a spec, ticks 3 boxes, releases]
```

### 6.5 GitHub Actions CI

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm conformance
      - run: pnpm --filter @zettelgeist/cli build
      - run: node packages/cli/dist/bin.js regen --check
```

Last step builds the CLI binary then invokes it directly — avoids needing to publish/install during CI. If `INDEX.md` is stale, regen --check exits 1 and the workflow fails.

### 6.6 Husky template

`.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm dlx zettelgeist regen --check
```

Committed to the repo as a template, NOT installed via `package.json`'s prepare script (would force husky on every contributor). Users opt in by `pnpm add -D husky && pnpm husky init`.

## 7. Data flow

| Trigger | Path |
|---|---|
| **User runs `zettelgeist regen`** | CLI builds disk `FsReader` for cwd → `core.runConformance(fs)` → writes `${specsDir}/INDEX.md` if changed → exit 0 |
| **User runs `zettelgeist regen --check`** | Same as above but instead of writing, compares against on-disk content. Exit 0 if identical, exit 1 with diff if stale. |
| **User runs `zettelgeist tick user-auth 3`** | CLI parses → reads `tasks.md` → flips checkbox at index 3 → atomic write → regen → `git add tasks.md INDEX.md` → `git commit -m '[zg] tick: user-auth#3'` → print result (or `{ok: true, data: {commit: <sha>}}` with `--json`) |
| **User runs `zettelgeist new payment-flow`** | CLI scaffolds `specs/payment-flow/{requirements.md,tasks.md,handoff.md}` with stub headings → regen → `git add` all four files → `git commit -m '[zg] new: payment-flow'` |
| **User runs `zettelgeist install-hook`** | CLI reads `.git/hooks/pre-commit` (if exists) → checks for `# >>> zettelgeist >>>` markers → if present, replace block (idempotent); if not present and file empty/missing, write the marker block; if file exists with non-marker content, refuse with instruction → set executable bit (chmod 0755) |
| **User runs `git commit`** | Pre-commit hook executes `zettelgeist regen --check`. Exit 1 → commit aborts. Exit 0 → commit proceeds. The hook does NOT auto-write; users get a clear error and re-run regen explicitly. |
| **Agent calls `tick_task` via MCP** | MCP server reads → flip → atomic write → regen → commit (same path as CLI's tick). Returns `{commit: <sha>}` to caller. |
| **Agent calls `claim_spec` via MCP** | MCP server writes `specs/<name>/.claim` (gitignored). No commit. Returns acknowledgment. |
| **CI runs on PR** | `pnpm install --frozen-lockfile` → `pnpm -r typecheck` → `pnpm -r test` → `pnpm conformance` → build CLI → `regen --check`. Any non-zero exit fails. |
| **Cycle introduced via `depends_on` in a PR** | `regen --check` calls validateRepo, which returns `E_CYCLE`; CLI exits 1 with the cycle path. PR fails CI. |
| **User runs `zettelgeist serve`** | Prints "viewer ships in v0.2; tracking issue: <link>" and exits 0. Real implementation in Plan 2.5. |

**Two invariants worth pinning explicitly:**

1. **The pre-commit hook never writes.** It only reads (via `regen --check`). If `INDEX.md` is stale, the user's commit is blocked with a message: "INDEX.md is stale. Run `zettelgeist regen` and re-stage." This avoids hooks silently mutating staged files (which surprises users badly).
2. **Every CLI mutating command produces exactly one commit.** No silent batching. A bash loop ticking 5 tasks produces 5 commits. Same as the MCP tool semantics.

## 8. CLI command surface

All commands accept `--json` (boolean, default false). Without `--json`, output is human-readable.

| Command | Args | Flags | Effect |
|---|---|---|---|
| `regen` | `[path]` (default cwd) | `--check` | Regenerate INDEX.md. With `--check`, exit 1 on stale instead of writing. |
| `validate` | `[path]` | — | Run `validateRepo`, print errors. Exit 0 if no errors, 1 otherwise. |
| `new` | `<name>` | `--no-tasks`, `--no-handoff` | Scaffold a spec folder. Default creates all three files. |
| `tick` | `<spec> <n>` | — | Tick task n in spec's tasks.md. |
| `untick` | `<spec> <n>` | — | Untick task n. |
| `claim` | `<spec> [agent_id]` | — | Write `.claim` (defaults agent_id to `${USER}@${HOSTNAME}`). |
| `release` | `<spec>` | — | Remove `.claim`. |
| `status` | `[spec]` | `--all` | No spec → board summary. With spec → spec detail. `--all` shows all 7 columns. |
| `install-hook` | — | `--force` | Install pre-commit hook with smart-merge. `--force` replaces a non-marker hook (with backup at `pre-commit.before-zettelgeist`). |
| `serve` | — | — | **Stub for v0.1.** Prints viewer-coming-in-v0.2 message and exits. Real implementation lands in Plan 2.5. |

**JSON envelope** (every command, when `--json` passed):

```ts
type Envelope<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { message: string; detail?: unknown } };
```

Concrete examples:
- `zettelgeist regen --json` → `{"ok":true,"data":{"changed":true,"path":"specs/INDEX.md"}}`
- `zettelgeist regen --check --json` (stale) → `{"ok":false,"error":{"message":"INDEX.md is stale","detail":{...diff...}}}` and exit 1
- `zettelgeist tick user-auth 3 --json` → `{"ok":true,"data":{"commit":"a1b2c3d","spec":"user-auth","index":3}}`
- `zettelgeist validate --json` (errors) → `{"ok":false,"error":{"message":"3 validation errors","detail":{"errors":[...]}}}`
- `zettelgeist status --json` → `{"ok":true,"data":{"specs":[{"name":"user-auth","status":"in-progress","progress":"3/5"},...]}}`

**Error code policy.** Format-layer errors (`E_CYCLE`, `E_INVALID_FRONTMATTER`, `E_EMPTY_SPEC`) keep their codes — they're spec-normative. CLI-surface errors (stale INDEX, missing repo, hook conflict) **do not** carry stable codes; they're human-readable messages only. Agents reading `--json` output should switch on `error.detail.code` (when present) for format-layer errors; they should treat surface-level failures by exit code + message.

## 9. MCP tool surface

Each tool's input/output schemas are Zod. Format-layer errors propagate as MCP errors with the `E_*` code in the message + structured `data` field carrying the original `ValidationError`.

```ts
// list_specs
input:  z.object({})
output: z.array(z.object({
  name: z.string(),
  status: z.enum(['draft','planned','in-progress','in-review','done','blocked','cancelled']),
  progress: z.string(),                      // e.g. "3/5"
  blockedBy: z.string().nullable(),
}))

// read_spec
input:  z.object({ name: z.string() })
output: z.object({
  name: z.string(),
  frontmatter: z.record(z.unknown()),
  requirements: z.string().nullable(),
  tasks: z.array(z.object({
    index: z.number(), checked: z.boolean(), text: z.string(),
    tags: z.array(z.enum(['#human-only','#agent-only','#skip'])),
  })),
  handoff: z.string().nullable(),
  lenses: z.record(z.string()),              // {lensName: content}
})

// read_spec_file
input:  z.object({ name: z.string(), relpath: z.string() })
output: z.object({ content: z.string() })

// write_spec_file
input:  z.object({ name: z.string(), relpath: z.string(), content: z.string() })
output: z.object({ commit: z.string() })

// tick_task / untick_task
input:  z.object({ name: z.string(), n: z.number().int().positive() })
output: z.object({ commit: z.string() })

// set_status
input:  z.object({
  name: z.string(),
  status: z.enum(['blocked','cancelled']).nullable(),  // null clears the override
  reason: z.string().optional(),
})
output: z.object({ commit: z.string() })

// claim_spec / release_spec
input:  z.object({ name: z.string(), agent_id: z.string().optional() })  // claim
        z.object({ name: z.string() })                                   // release
output: z.object({ acknowledged: z.literal(true) })

// write_handoff
input:  z.object({ name: z.string(), content: z.string() })
output: z.object({ commit: z.string() })

// regenerate_index
input:  z.object({})
output: z.object({ commit: z.string().nullable() })  // null if no change

// validate_repo
input:  z.object({})
output: z.object({
  errors: z.array(z.discriminatedUnion('code', [
    z.object({ code: z.literal('E_CYCLE'),               path: z.array(z.string()) }),
    z.object({ code: z.literal('E_INVALID_FRONTMATTER'), path: z.string(), detail: z.string() }),
    z.object({ code: z.literal('E_EMPTY_SPEC'),          path: z.string() }),
  ])),
})

// install_git_hook
input:  z.object({ force: z.boolean().optional() })
output: z.object({ acknowledged: z.literal(true) })
```

## 10. Viewer placeholder

This section locks in the architecture for HTML rendering, even though Plan 2 only ships a stub.

**Principle: viewer-as-code, content-as-data.**

- **Storage stays markdown.** Always. The repo is the database.
- **One canonical HTML viewer ships with the `zettelgeist` tool**, versioned with the format. Format v0.1 = viewer v0.1. No drift.
- **Repos do not contain viewer files by default.** A vanilla `zettelgeist new` adds zero HTML/CSS to the repo. The viewer lives inside the npm package.
- **Customization is opt-in and lives in the user's repo only when they choose.** Four progressive layers:

  | Layer | Where | When you'd use it |
  |---|---|---|
  | **0. Bundled defaults** | `packages/cli/dist/viewer/` ships with the npm package | Zero config — most users |
  | **1. Theme selection** | `viewer_theme: <name>` in `.zettelgeist.yaml` | Pick from bundled themes |
  | **2. CSS override** | Optional `.zettelgeist/viewer.css` in the repo | Tweak colors/spacing without forking the template |
  | **3. Full template override** | Optional `.zettelgeist/viewer/` directory | Power users (v0.3+) |

- **`zettelgeist serve` works on any Zettelgeist repo, even ones that have never heard of the viewer.**

**For Plan 2 (this plan):**

- The `serve` subcommand exists in the CLI's command registry.
- Running `zettelgeist serve` (without `--json`) prints `viewer ships in v0.2 (Plan 2.5); tracking: <link>` to stderr and exits 1.
- With `--json`, returns `{ok: false, error: {message: "viewer not yet implemented"}}` and exits 1.
- No viewer files ship with the package yet.
- The non-zero exit signals to scripts that this isn't a working command yet — clearer than a fake-success stub.

**For Plan 2.5 (next):**

- Ship the bundled viewer (layer 0) — single HTML page that fetches markdown files and renders board + graph + spec detail.
- Implement theme selection (layer 1) — config field `viewer_theme: <name>`, bundled themes (start with one default + dark).
- Wire `serve` to a tiny Node `http` server that serves the viewer + reads cwd files on demand.
- Layers 2 and 3 deferred to v0.3.

## 11. Testing strategy

**Per package:**

- **`fs-adapters/`** — Unit tests for `makeDiskFsReader` against a tmpdir; unit tests for `makeMemFsReader` using the existing `core` test cases. ~10 tests.
- **`cli/`**:
  - Unit tests for `output.ts` (envelope shape) and `git.ts` (commit message format).
  - Unit tests for `install-hook.ts`'s smart-merge logic against a fake `.git/hooks/` directory in a tmpdir.
  - **One e2e test** that spawns the built bin (`node dist/bin.js`) against a tmpdir-with-real-repo, exercises `regen` + `tick` + `validate`, asserts on stdout/stderr/exit code. Catches packaging issues (shebang, exports, ESM/CJS surprises).
- **`mcp-server/`**:
  - Unit tests per tool, in-process, using `Server.connect(InMemoryTransport)` from the MCP SDK. Each tool: input → handler → output assertion. ~13 tests.
  - **One e2e test** that spawns the built bin and exchanges JSON-RPC frames over stdio. Verifies the binary actually runs as an MCP server.

**Workspace-level:**
- `pnpm -r test` runs all package tests
- `pnpm conformance` continues to run against fixtures
- CI runs typecheck + test + conformance + `regen --check`

**Explicitly NOT tested in v0.1:**
- Cross-tool ordering (e.g. claim → tick → release as a sequence). Each tool tested in isolation; the sequence is implicit.
- Network/HTTP transport — out of scope.
- Hook execution under real git invocation — the smart-merge logic is unit-tested, but we don't actually `git commit` in the hook test. Spawn-the-bin e2e covers the integration partially.

## 12. Open questions / risks

- **MCP SDK version churn.** `@modelcontextprotocol/sdk` is itself young. Pin a version, document it, plan to track.
- **`zettelgeist new` defaults.** What goes in the stub `requirements.md`? Lean toward simple `# <name>\n\n(write requirements here)\n` plus a frontmatter block with empty `depends_on: []`.
- **Hook installation on Windows.** `chmod 0755` is a no-op on Windows; `.git/hooks/pre-commit` works without it on Git for Windows. Test on macOS/Linux only for v0.1.
- **`zettelgeist status` rendering.** Without `--json`, board view should fit in a terminal. Use a simple ASCII-table approach (no fancy box-drawing for v0.1). Truncation behavior for long blocked-by strings — punt to "trust the user's terminal" for v0.1.
- **Rust port (lever for later).** Conformance fixtures are language-neutral; a future Rust CLI/core can target them as the contract. Worth noting in the format spec as a v0.2+ option.
- **MCP server multi-client.** Spec says single client at a time. If the user runs the MCP server twice in parallel against the same repo, both processes will compete on git operations. The OS-level git lock prevents corruption but might confuse agents. Punt to v0.2.
- **Viewer architecture commitment.** §10 locks in the viewer-as-code principle. Plan 2.5 must follow this without drift; Plan 4 (VSCode webviews) should align.

## 13. What this design does NOT commit to

- That the CLI command surface is final. Plan 2.5 may add `serve` flags; v0.2+ may add more commands. Adding is non-breaking; renaming or removing is a major-version change.
- That the MCP tool surface is final. Same rule.
- That HTML rendering will always be tool-bundled. The principle holds for v0.1; future versions may revisit if there's demand for repo-bundled viewers (which would compromise the "clone and read" property — high bar).
- That CI runs only on GitHub Actions. Other forges (GitLab, Forgejo, Gitea) should be able to consume the same `regen --check` invocation; we're just not writing config for them in v0.1.
