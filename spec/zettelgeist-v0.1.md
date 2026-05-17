# Zettelgeist Format Specification — v0.1

- **Status:** Draft
- **Format version:** 0.1
- **Date:** 2026-05-06

> **Reference implementation**: this format is implemented by [`@zettelgeist/core`](../packages/core/) (TypeScript). Other implementations are encouraged — pass [the conformance fixture suite](conformance/fixtures/) to be conformant.

## 1. Abstract

Zettelgeist is a portable file format for spec-driven, agent-friendly project management. A repository opts into the format by committing a `.zettelgeist.yaml` file at the repo root. Spec folders under `specs/` carry markdown files (`requirements.md`, `tasks.md`, `handoff.md`, optional `lenses/*.md`) whose contents and YAML frontmatter define the project's work, status, and graph relationships. Status is derived from file contents on each read; it is never stored independently.

This document is the normative specification for v0.1. Implementations in any language MAY exist; conformance is defined by passing the fixture suite at `spec/conformance/fixtures/`.

## 2. Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

YAML in this document refers to YAML 1.2. CommonMark refers to the CommonMark 0.30 specification. Filesystem paths use forward slashes regardless of host OS. Line endings are LF; implementations MAY accept CRLF on input but MUST emit LF.

## 3. Repository opt-in (`.zettelgeist.yaml`)

A repository is a Zettelgeist repository if and only if a file named `.zettelgeist.yaml` exists at the repository root. Implementations MUST treat repositories without this file as outside the format's scope.

The file MUST be valid YAML and MUST contain at least:

```yaml
format_version: "0.1"
```

Optional fields:

- `specs_dir` (string, default `"specs"`) — relative path to the directory containing spec folders.
- `default_branch` (string, default detected from git) — the branch on which merged work counts as `done`.
- `viewer_theme` (string, one of `"light"` / `"dark"` / `"system"`, default `"system"`) — non-normative hint for tools that render an HTML view of the repo. Implementations that don't render HTML MUST ignore this field.

Unknown top-level fields MUST be preserved but MAY be ignored.

If `format_version` is missing or not a string, implementations MUST emit `E_INVALID_FRONTMATTER` (the error applies to `.zettelgeist.yaml` itself, with `path = ".zettelgeist.yaml"`).

If `format_version` is a recognized format the implementation supports, processing continues. If it is a different value, implementations SHOULD emit a warning and MAY continue best-effort processing.

## 4. Spec folder structure

A **spec** is a subdirectory of `<specs_dir>` whose name matches the regular expression `^[a-z0-9-]+$`. The spec MUST contain at least one file with the `.md` extension; otherwise implementations MUST emit `E_EMPTY_SPEC` with `path` set to the spec folder's path.

Recognized files within a spec folder:

- `requirements.md` — OPTIONAL. The only file that carries spec-level YAML frontmatter (see §5).
- `tasks.md` — OPTIONAL. CommonMark with GitHub-flavored task list items (see §6).
- `handoff.md` — OPTIONAL. Free-form CommonMark; agents and humans use it for session continuity.
- `lenses/` — OPTIONAL. A flat directory of `*.md` files. Implementations SHOULD ignore subdirectories within `lenses/`. Lens names are the basename without the `.md` extension.

Other files in a spec folder MUST be preserved but MAY be ignored.

## 5. Frontmatter schema

Spec-level frontmatter lives only in `requirements.md`. If `requirements.md` is absent, the spec has no frontmatter; this is a valid state.

If frontmatter is present, it MUST be valid YAML 1.2 between `---` fences at the start of the file. On parse failure, implementations MUST emit `E_INVALID_FRONTMATTER` with `path` set to the file path and `detail` set to the underlying parser message.

Recognized fields (all OPTIONAL):

| Field | Type | Semantics |
|---|---|---|
| `status` | `"blocked"` \| `"cancelled"` | Explicit override (see §7). |
| `blocked_by` | string | Human-readable blocker description. Rendered in `INDEX.md`'s "Blocked by" column. |
| `depends_on` | array of strings | Names of specs this spec depends on. Edges to nonexistent specs MUST be ignored without error. |
| `part_of` | string | Grouping label. Has no effect on status; surfaces use it for clustering. |
| `replaces` | string | Lifecycle pointer: this spec supersedes another. Not a graph edge. |
| `merged_into` | string | Lifecycle pointer: this spec was deduped into another. Surfaces SHOULD redirect. |
| `auto_merge` | boolean | Reserved for v0.2. v0.1 implementations MUST parse this field but MUST NOT act on it. |

Unknown fields MUST be preserved but MAY be ignored.

## 6. Inline task tags

Within `tasks.md`, GitHub-flavored task list items MAY carry inline tags. Tags are whitespace-delimited tokens, case-sensitive, and may appear anywhere on the task line.

Recognized tags:

| Tag | Semantics |
|---|---|
| `#human-only` | Agents MUST skip this task. Surfaces SHOULD flag it as awaiting human action. |
| `#agent-only` | Humans MUST NOT tick this box via a UI. Agents may tick it via a write. |
| `#skip` | The task is excluded from completeness counting (see §7). |

Unknown hash-prefixed tokens MUST be preserved in the task text and MAY be ignored.

## 7. Status derivation

Status is computed from the spec's contents and the repository's git state. Implementations MUST evaluate the rules in the following priority order; the first matching rule produces the status:

1. If `frontmatter.status == "cancelled"` → `cancelled`.
2. If `frontmatter.status == "blocked"` → `blocked`.
3. Let `counted` = tasks whose `tags` do not include `#skip`.
4. If `counted` is empty:
   - If a `.claim` file is present and not stale → `in-progress`.
   - Otherwise → `draft`.
5. If every task in `counted` is `checked`:
   - If the spec's changes are merged to the default branch → `done`.
   - Otherwise → `in-review`.
6. If any task in `counted` is `checked`, OR a non-stale `.claim` file is present → `in-progress`.
7. Otherwise → `planned`.

Claim staleness is implementation-defined; v0.1 implementations SHOULD treat claims older than 24 hours as stale.

**v0.2 read-time extension (back-compat):** v0.2-aware implementations also recognise per-actor claim files matching the pattern `specs/<name>/.claim-<slug>`, where `<slug>` matches `[A-Za-z0-9._-]+` (1–64 characters; case preserved). Filenames starting with `.claim-` that do not satisfy this constraint are out of scope: readers MAY ignore them or treat them as claims, but writers MUST NOT produce them.

Multiple per-actor files SHALL be permitted on the same spec; the spec is considered claimed as long as any non-stale `.claim` *or* matching `.claim-<slug>` file exists. v0.2 writers SHOULD prefer the per-actor shape to avoid merge conflicts when two actors claim the same spec concurrently. v0.1 readers that only check for the literal `.claim` filename will miss per-actor claims but otherwise behave correctly. Staleness handling for per-actor files is implementation-defined; the v0.2 reference implementation does not check staleness today.

The "merged to the default branch" relation is implementation-supplied (see §8). v0.1 implementations MAY use git ancestry of the most recent commit touching `tasks.md` or `requirements.md`.

## 8. Spec graph

The spec graph is derived from frontmatter at read time. Nodes are spec names. Edges are derived as follows:

- For each spec, its `depends_on` array contributes one outgoing edge per entry. Entries pointing to nonexistent specs MUST be ignored without error.
- Reverse `depends_on` edges (named `blocks` in this spec) MUST be derived at index-render time, never stored.
- `part_of`, `replaces`, and `merged_into` MUST NOT contribute to the dependency graph for cycle-detection purposes.

Implementations MUST detect cycles in the `depends_on` relation. Each detected cycle MUST be reported once, as an ordered array of spec names rotated so the lexicographically smallest name appears first. Implementations MUST emit `E_CYCLE` with `path` set to the cycle array.

## 9. `INDEX.md` regeneration

Implementations regenerate `<specs_dir>/INDEX.md` from spec contents. Two regions are separated by exactly one delimiter:

````
<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->
````

Region above the delimiter is the **human region** and MUST be preserved byte-for-byte across regenerations, modulo trailing whitespace normalization. Region below is the **auto region** and MUST be replaced in full.

If the existing file does not contain the delimiter, implementations MUST treat the entire existing content as the human region and insert the delimiter immediately after it. If the file does not exist, the human region is empty and the output begins with the delimiter.

The auto region MUST contain, in order:

1. A `## State` section: a markdown table with columns `Spec`, `Status`, `Progress`, `Blocked by`. Rows MUST be sorted by spec name lexicographically. `Progress` is rendered as `<checked>/<total>` where both numbers count only tasks whose tags do not include `#skip`. `Blocked by` is `frontmatter.blocked_by` if present and non-empty, otherwise the em-dash `—`.
2. A `## Graph` section: a Mermaid `graph TD` block listing every node on its own line, then every `depends_on` edge as `from --> to`. Nodes and edges MUST be sorted lexicographically.

When there are no specs, both sections render the literal string `_No specs._` instead of a table or mermaid block.

Two conformant implementations MUST produce byte-identical `INDEX.md` for the same input repo.

### 9.1 INDEX.md merge (v0.2, non-normative)

Because `INDEX.md` is fully derived, merging two branches that both regenerated it produces a content conflict on every concurrent change. Implementations SHOULD configure `specs/INDEX.md merge=union` in `.gitattributes` so the merge produces a (transient) concatenation rather than conflict markers, AND install a `post-merge` hook that runs the regen against the now-fully-merged tree, replacing the concatenation with the correct INDEX. The v0.2 reference implementation does this automatically via `zettelgeist install-hook`. The merged INDEX is still required to match the byte-identical rule above against the post-merge tree.

### 9.2 `tasks.md` merge (v0.2, non-normative)

For `specs/*/tasks.md`, v0.2 implementations SHOULD configure a semantic three-way merge. Tasks are matched by their cleaned text (after numeric-prefix and known-tag stripping per §6); per matched task: either side checked → checked (commutative), both un-checked from a checked base → un-checked, tags are unioned, prose structure from `ours` is preserved. Renamed tasks coexist as two entries (delete-and-add semantics). The v0.2 reference implementation ships this as the `zettelgeist merge-driver tasks` driver wired into `.git/config` by `install-hook`, with `specs/*/tasks.md merge=zettelgeist-tasks` in `.gitattributes`. Unlike INDEX, the tasks driver does not depend on any other file's state, so the per-file driver approach works correctly.

### 9.3 `requirements.md` frontmatter merge (v0.2, non-normative)

For `specs/*/requirements.md`, v0.2 implementations SHOULD configure a per-field three-way merge of the YAML frontmatter block. The rules below are **3-way** (base, ours, theirs): "unchanged from base" means a side did not modify the field; the other side wins. "Both changed differently" means both sides modified the field to different values; this emits a conflict marker.

| Field | Rule |
| --- | --- |
| `status` (the seven values from §7) | 3-way; both changed differently → conflict marker |
| `depends_on`, `replaces` (lists) | set union with first-occurrence order preservation; spec-violating non-string entries are preserved, not dropped |
| `blocked_by`, `part_of`, `merged_into` (scalars) | 3-way: both same → that; one side unchanged from base → take the other (including an explicit clear); both changed differently → conflict marker |
| `auto_merge` (boolean) | 3-way (NOT raw logical OR) — symmetric, so either side can flip `true → false` if the other is unchanged |
| Unknown keys | opaque 3-way with structural equality (`deepEqual`); nested objects compared structurally and round-tripped |

The `auto_merge` rule deserves a note: an earlier draft specified logical OR, which made `auto_merge: true` impossible to turn off once committed to base. 3-way semantics restore symmetry — turning `auto_merge` off works the same as turning any other scalar off.

For unknown keys, the merger does NOT attempt structural sub-merges of nested objects: an object value is treated as an atomic unit, compared with the other side via `deepEqual`, and either passed through or emitted as a conflict block. This keeps the merger predictable on schema extensions the spec doesn't know about.

The body below the closing `---` is merged via a textual three-way merge (the reference implementation uses `git merge-file -p`). When both sides change overlapping lines, standard `<<<<<<<` markers are emitted. Conflict markers in the YAML region use `# <<<<<<< ours: <key>` comment syntax so the file remains parseable enough for editors. The v0.2 reference implementation ships this as the `zettelgeist merge-driver frontmatter` driver.

The driver's exit code follows git's contract: 0 = clean resolution (no markers); non-zero = the file contains conflict markers and git MUST treat it as conflicted (rebase / merge pauses for the user). Implementations that don't propagate the exit code will leak unresolved conflict markers into commits.

## 10. Validation errors

Implementations MUST emit validation errors using these machine codes. Human-readable messages are implementation freedom.

| Code | When |
|---|---|
| `E_CYCLE` | A cycle was detected in the `depends_on` graph. `path` is the cycle as an ordered list of spec names. |
| `E_INVALID_FRONTMATTER` | YAML in `requirements.md` (or `.zettelgeist.yaml`) failed to parse, or a known field has the wrong type. `path` is the file path; `detail` is implementation-defined. |
| `E_EMPTY_SPEC` | A folder under `<specs_dir>` matches the spec-name pattern but contains no `.md` files anywhere. `path` is the folder path. |

Conditions not enumerated above (nested `lenses/` directories, folder names that don't match the spec-name pattern, unknown `format_version`) are non-errors at the format level. Implementations MAY surface them as warnings.

## 11. Reserved paths

The path `.zettelgeist/` at the repo root is reserved for Zettelgeist tools. Implementations and surfaces SHOULD use this directory for tool-managed state and user-managed customization, separated by subdirectory:

| Path | Purpose | Lifecycle |
|---|---|---|
| `.zettelgeist/render-templates/` | User-managed customization for HTML rendering surfaces (themes, CSS overrides, full template overrides). | Committed by the user. |
| `.zettelgeist/regen-cache.json` | Tool-managed content-addressed cache for `INDEX.md` regeneration, keyed by the git tree SHA of `<specs_dir>`. | Tool-managed; MUST be gitignored. |
| `.zettelgeist/exports/` | Tool-managed: HTML or other artifacts produced by export commands for external sharing. | Tool-managed; MUST be gitignored. |

Implementations MUST NOT store tool-managed state under `.zettelgeist/render-templates/` (reserved for user content). Implementations MUST NOT commit files under `.zettelgeist/regen-cache.json` or `.zettelgeist/exports/`.

Other paths under `.zettelgeist/` are reserved for future use. The path `.claim` inside any spec folder remains reserved per §7 (status derivation) and is also gitignored.

The HTML rendering produced by tools (the local viewer, export artifacts) is **non-normative**. The format spec does not specify HTML output, and conformance fixtures only test the markdown-to-derived-state pipeline.

## 12. Conformance

A conformance fixture is a directory under `spec/conformance/fixtures/` containing two subdirectories:

- `input/` — a snapshot of a Zettelgeist repository (containing at minimum `.zettelgeist.yaml`).
- `expected/` — files describing the expected output for that input:
  - `statuses.json` — `{ "specs": { "<name>": "<status>", ... } }`.
  - `graph.json` — `{ "nodes": [...], "edges": [...], "cycles": [[...]] }`.
  - `validation.json` — `{ "errors": [...] }`.
  - `INDEX.md` — the byte-exact expected `INDEX.md` for `specs_dir`.

An implementation MUST, for every fixture, produce output that compares equal to the expected files under these rules:

- `*.json` — deep structural equality after JSON parse. Key order and whitespace are not significant.
- `INDEX.md` — byte-exact equality including line endings and trailing newlines.
- Validation errors — matched on `{code, path}` only. Other fields (such as `detail`) are excluded from comparison.

Conformance is asserted by passing every fixture in the suite.

## 13. Versioning

The format itself is versioned with semver. The current version is `0.1`.

- A **major** version bump indicates breaking changes — fixture outputs may change, fields may be added or removed in incompatible ways.
- A **minor** bump adds optional fields, error codes (in a reserved range), or additive rules.
- A **patch** bump clarifies wording without changing observable behavior.

Implementations MUST declare the format versions they support. Encountering a `.zettelgeist.yaml` with a `format_version` outside the declared support set SHOULD produce a warning and MAY continue best-effort processing.

## 14. Future work (non-normative)

The following are reserved for future versions of this spec and are explicitly out of scope for v0.1:

- Events (webhook and MCP event stream payloads).
- Suggestion-branch contribution flow.
- Agent loop orchestration semantics.
- `auto_merge: true` triggering automated merge behavior.
- Multi-repo specs with cross-repo identifiers.
- Format-level support for richer non-text content (image embeds, decision tables) in `requirements.md`.

## Appendix A. Rule → fixture map

Each numbered rule below cites the conformance fixture(s) that prove it. New rules MUST add a fixture; rules without a fixture are not normative.

| Section | Rule | Fixture |
|---|---|---|
| §3 | `.zettelgeist.yaml` is the opt-in marker. | 01-empty-repo |
| §3 | `format_version` missing or non-string → `E_INVALID_FRONTMATTER` on `.zettelgeist.yaml`. | 09-bad-config |
| §3 | `specs_dir` honored when set. | 10-custom-specs-dir |
| §4 | A spec is a folder with at least one `.md` file. | 02-single-spec, 08-empty-spec |
| §4 | Empty spec folder → `E_EMPTY_SPEC`. | 08-empty-spec |
| §5 | `requirements.md` carries spec-level frontmatter. | 04-cycle, 05-blocked |
| §5 | Malformed frontmatter → `E_INVALID_FRONTMATTER`. | 07-invalid-frontmatter |
| §6 | `#skip` excludes from completeness counting. | 03-inline-tags |
| §7 | Cancelled / blocked overrides win over derivation. | 05-blocked |
| §7 | Some ticked → `in-progress`. | 02-single-spec |
| §7 | No tasks, no claim → `draft`. | 04-cycle, 07-invalid-frontmatter |
| §8 | `depends_on` cycle → `E_CYCLE` with rotated cycle path. | 04-cycle |
| §9 | Marker absent → entire existing content becomes human region. | 01-empty-repo |
| §9 | Human region preserved byte-identically. | 06-human-region |
| §9 | No specs → `_No specs._` placeholder. | 01-empty-repo |
| §9 | State table renders progress and blocked_by. | 02-single-spec, 05-blocked |
| §10 | `E_CYCLE` is reachable. | 04-cycle |
| §10 | `E_INVALID_FRONTMATTER` is reachable. | 07-invalid-frontmatter |
| §10 | `E_EMPTY_SPEC` is reachable. | 08-empty-spec |
| §10 | Multiple errors sorted by `(code, path)`. | 11-mixed-errors |
