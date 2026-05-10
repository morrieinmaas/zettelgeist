# Zettelgeist architecture

## Package layout

```
zettelgeist/
+-- packages/
|   +-- core/                 # @zettelgeist/core - pure TS format library
|   +-- fs-adapters/          # @zettelgeist/fs-adapters - disk + memory FsReader
|   +-- viewer/               # @zettelgeist/viewer - HTML/CSS/JS web app bundle
|   +-- cli/                  # @zettelgeist/cli - `zettelgeist` Node binary
|   +-- mcp-server/           # @zettelgeist/mcp-server - `zettelgeist-mcp` stdio
+-- spec/
|   +-- zettelgeist-v0.1.md   # the format spec
|   +-- conformance/          # fixtures + harness
+-- docs/                     # design + this doc
+-- .github/workflows/ci.yml
+-- .husky/                   # pre-commit template
```

## Responsibility per package

| Package | Owns | Imports |
|---|---|---|
| core | parsing, derivation, validation, regen — pure functions | (none — only types from itself) |
| fs-adapters | filesystem reader implementations (disk, in-memory) | core |
| viewer | UI: board, detail, graph, docs, themes — pure browser code | (none — talks to `window.zettelgeistBackend`) |
| cli | binary + commands + HTTP server hosting the viewer | core, fs-adapters, (viewer bundle copied at build time) |
| mcp-server | stdio MCP server with 15 tools | core, fs-adapters |

The format spec is the contract; conformance fixtures are the test. Other implementations in any language pass the same fixtures and are conformant by definition.

## Data flow

**Human via the viewer:**

```
user (browser)
  -> viewer: click/edit
  -> REST PUT/POST to localhost:7681
  -> CLI HTTP handler
  -> @zettelgeist/core (parse, validate, regen)
  -> markdown files written + git commit
  -> response surfaces back to viewer
```

**Agent via MCP:**

```
agent (Claude Code, etc.)
  -> stdio JSON-RPC
  -> @zettelgeist/mcp-server tool handler
  -> @zettelgeist/core (parse, validate, regen)
  -> markdown files written + git commit
  -> response back over stdio
```

**Pre-commit hook:**

```
git commit
  -> .git/hooks/pre-commit
  -> `zettelgeist regen --check`
  -> @zettelgeist/core
  -> exit 0 (clean) or exit 1 (INDEX.md stale)
```

## The host-agnostic viewer

The viewer is a vanilla HTML/CSS/JS bundle that knows nothing about its host. It calls `window.zettelgeistBackend` (a 15-method interface defined at [packages/viewer/src/backend.ts](../packages/viewer/src/backend.ts)) and the host wires that up:

- **`zettelgeist serve`** (today): backend = REST -> Node http server -> `core` -> markdown files.
- **VSCode webview** (future Plan 4): backend = postMessage -> extension host -> `core` -> markdown files.
- **Hosted viewer** (future v0.3+): backend = WebSocket / GraphQL -> server -> `core` -> markdown files.

The viewer code is identical across hosts. Only the transport differs.

## Build system

- Library packages (`core`, `fs-adapters`) emit `.d.ts` via tsc (so consumers get types).
- App packages (`cli`, `mcp-server`) bundle a single binary via esbuild (so the npm tarball is small and self-contained).
- The viewer bundles via esbuild and gets copied into `packages/cli/dist/viewer-bundle/` at CLI build time.
- The conformance harness uses vitest with path aliases so it runs against source without needing a build.

## Storage layer (markdown) vs interaction layer (HTML)

The format spec describes only the markdown storage layer. HTML rendering is **non-normative** — it's a tool concern. Cloning a vanilla Zettelgeist repo never adds viewer code; the viewer ships with the CLI and is served at runtime.

Customization layers at `.zettelgeist/render-templates/` (CSS overrides, future template overrides) are user-controlled and may be committed by the user; everything else under `.zettelgeist/` is gitignored runtime cache.

## Cross-implementation compatibility

If you build a Zettelgeist implementation in another language:

1. Read [spec/zettelgeist-v0.1.md](../spec/zettelgeist-v0.1.md).
2. Run [spec/conformance/harness/](../spec/conformance/harness/) against your implementation. Each fixture has an `input/` and `expected/` directory; your impl walks `input/` and produces output that compares equal to `expected/` per the rules in spec §12.
3. If all 11 fixtures pass, you're conformant.

## Versioning

The format itself is versioned with semver: `format_version: "0.1"` in `.zettelgeist.yaml`. Tools declare which versions they support; mismatches are warnings, not errors.

Implementation packages (`@zettelgeist/cli`, etc.) follow their own semver — typically tracking the format version in major.minor and using patch for bug fixes.
