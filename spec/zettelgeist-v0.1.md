# Zettelgeist Format Specification — v0.1

- **Status:** Draft
- **Format version:** 0.1
- **Date:** 2026-05-06

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

## 10. Validation errors

Implementations MUST emit validation errors using these machine codes. Human-readable messages are implementation freedom.

| Code | When |
|---|---|
| `E_CYCLE` | A cycle was detected in the `depends_on` graph. `path` is the cycle as an ordered list of spec names. |
| `E_INVALID_FRONTMATTER` | YAML in `requirements.md` (or `.zettelgeist.yaml`) failed to parse, or a known field has the wrong type. `path` is the file path; `detail` is implementation-defined. |
| `E_EMPTY_SPEC` | A folder under `<specs_dir>` matches the spec-name pattern but contains no `.md` files anywhere. `path` is the folder path. |

Conditions not enumerated above (nested `lenses/` directories, folder names that don't match the spec-name pattern, unknown `format_version`) are non-errors at the format level. Implementations MAY surface them as warnings.

## 11. Conformance

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

## 12. Versioning

The format itself is versioned with semver. The current version is `0.1`.

- A **major** version bump indicates breaking changes — fixture outputs may change, fields may be added or removed in incompatible ways.
- A **minor** bump adds optional fields, error codes (in a reserved range), or additive rules.
- A **patch** bump clarifies wording without changing observable behavior.

Implementations MUST declare the format versions they support. Encountering a `.zettelgeist.yaml` with a `format_version` outside the declared support set SHOULD produce a warning and MAY continue best-effort processing.

## 13. Future work (non-normative)

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
