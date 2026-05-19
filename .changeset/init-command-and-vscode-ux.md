---
"@zettelgeist/core": minor
"@zettelgeist/cli": minor
---

### `@zettelgeist/core` — shared init defaults

New module `init-defaults` exports the canonical content for `zettelgeist init` so the CLI and the VS Code extension produce byte-identical output. Public API:

- `DEFAULT_CONFIG` — the `.zettelgeist.yaml` template (`format_version: "0.1"`)
- `DEFAULT_GITIGNORE_BLOCK` — the marker-delimited gitignore block (claim files + tool-managed state)
- `GITIGNORE_MARKER_BEGIN` / `GITIGNORE_MARKER_END` — the marker pair for idempotent detection
- `INIT_DIRS` — canonical three-dir layout (`specs`, `docs`, `.zettelgeist`)
- `gitignoreWithMarkerBlock(existing)` — pure function; returns the new content or `null` if marker already present

### `zettelgeist init` CLI command

New first-time onboarding command. Creates the v0.3 baseline layout in one shot:

- `.zettelgeist.yaml` (opt-in marker with `format_version: "0.1"`)
- `specs/` (empty — your first spec lands here)
- `docs/` (optional non-spec markdown)
- `.zettelgeist/` (tool-managed state — regen cache, exports)
- `.gitignore` marker block (gitignores claim files + tool-managed state)

Idempotent on the directory layout — re-running won't clobber pre-existing specs or duplicate the gitignore block. Requires `--force` to overwrite an existing `.zettelgeist.yaml` (so you don't lose a custom `specs_dir:` override by accident).

Also surfaces a friendly init UX in the VS Code extension (0.3.1, shipped separately via the marketplace flow): clicking the Zettelgeist Activity Bar icon in a non-Zettelgeist workspace now shows an "Initialize Zettelgeist…" prompt instead of leaking `Failed to list docs: ENOENT`. Same prompt fires before opening the board.
