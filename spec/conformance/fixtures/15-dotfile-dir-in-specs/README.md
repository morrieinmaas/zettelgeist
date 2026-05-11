# 15-dotfile-dir-in-specs — loader/validator asymmetry on dotfile-prefixed dirs

`specs/.archive/` exists alongside `specs/real/`. `.archive` does not
match the spec-name regex `[a-z0-9-]+` (it starts with `.`), so:

- **Loader** skips it → not in `statuses`, no graph node.
- **Validator** walks every dir entry under `specs/` without applying
  the regex, so it still reads `.archive/requirements.md` and emits
  `E_INVALID_FRONTMATTER` against the malformed YAML inside.

This asymmetry is real and surprising: a dir the loader treats as
non-existent can still produce validation errors against itself. Pinned
down here so a future "make validator also apply the regex" refactor
is a deliberate decision.

(Same asymmetry applies to unicode names — see fixture 12 — but that
fixture happens to use clean frontmatter so no validator error fires.)
