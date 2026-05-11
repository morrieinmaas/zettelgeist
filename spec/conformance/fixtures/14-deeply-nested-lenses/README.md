# 14-deeply-nested-lenses — `folderContainsMarkdown` is recursive but the lens loader is flat

This fixture pins down an asymmetry: the **empty-spec check** recurses,
but the **lens loader** does not.

The only markdown anywhere under `specs/foo/` is at
`specs/foo/lenses/security/owasp.md`. There is no `requirements.md`, no
`tasks.md`, no `handoff.md`, and no top-level lens file.

- `folderContainsMarkdown(specs/foo)` walks recursively, finds
  `owasp.md`, returns `true` → no `E_EMPTY_SPEC`.
- `loadSpec` iterates `lenses/` entries with `if (e.isDir) continue;`,
  so `security/` is skipped → the spec loads with an **empty** lens
  map.
- Net: the spec exists in `statuses`, contributes a graph node, and
  produces no validation errors — even though everything inside it is
  buried under a directory the loader refuses to enter.

If anyone "tidies up" `folderContainsMarkdown` to be non-recursive,
this fixture starts emitting `E_EMPTY_SPEC`. If anyone makes the lens
loader recursive, lens map content changes (not directly observable
through conformance, but the choice should still be deliberate).
