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

(filled in by a later task)

## 5. Frontmatter schema

(filled in by a later task)

## 6. Inline task tags

(filled in by a later task)

## 7. Status derivation

(filled in by a later task)

## 8. Spec graph

(filled in by a later task)

## 9. `INDEX.md` regeneration

(filled in by a later task)

## 10. Validation errors

(filled in by a later task)

## 11. Conformance

(filled in by a later task)

## 12. Versioning

(filled in by a later task)

## 13. Future work (non-normative)

(filled in by a later task)

## Appendix A. Rule → fixture map

(filled in by the final task)
