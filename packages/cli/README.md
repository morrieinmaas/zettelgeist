# @zettelgeist/cli

The `zettelgeist` CLI for the [Zettelgeist v0.1 format](../../spec/zettelgeist-v0.1.md).

## Install

```bash
npm i -g @zettelgeist/cli
```

## Commands

### `zettelgeist regen [path]`

Regenerate `<specs_dir>/INDEX.md` from the markdown spec files.

- `--check` exits 1 if INDEX.md is stale or missing instead of writing.
- `--json` machine-readable output.

Uses git's tree SHA of the specs directory as a content-addressed cache (gitignored at `.zettelgeist/regen-cache.json`) — skips the walk when nothing has changed since the last run.

### `zettelgeist validate [path]`

Run all format validators and report errors with machine-readable codes (`E_CYCLE`, `E_INVALID_FRONTMATTER`, `E_EMPTY_SPEC`, etc.). Exits 0 if clean, 1 otherwise.

- `--json` machine-readable output.

### `zettelgeist install-hook [--force]`

Install a git pre-commit hook (at `.git/hooks/pre-commit`) that runs `zettelgeist regen --check` before allowing a commit. The hook is wrapped in clearly-marked begin/end markers so it merges cleanly with existing user hooks; running again is idempotent. With `--force`, an existing hook is backed up to `pre-commit.backup` before being overwritten.

### `zettelgeist serve [--port N] [--no-open]`

Start a local HTTP server hosting the HTML viewer. Defaults to port 7681 on `127.0.0.1`. Auto-opens the browser unless `--no-open` is passed. The viewer is mobile-responsive and supports light/dark themes.

### `zettelgeist export-doc <path> [--template <path>]`

Render a single spec to HTML using a Mustache template. Default template renders requirements, tasks, handoff, and status. Use `--template` to point to a custom template file (also resolves under `.zettelgeist/render-templates/export.html` if present). Frontmatter fields are exposed as Mustache variables.

## JSON envelope

Every command supports `--json` for machine-readable output. The envelope is a tagged union:

```ts
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; detail?: unknown } };
```

Example success:

```json
{ "ok": true, "data": { "changed": false, "path": "specs/INDEX.md", "cacheHit": true } }
```

Example error:

```json
{ "ok": false, "error": { "message": "specs/INDEX.md is stale" } }
```

## License

Apache-2.0
