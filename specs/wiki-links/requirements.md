---
depends_on: []
part_of: v0.2-format
---
# Wiki-style links between specs

## Why

Today the only cross-spec references are explicit frontmatter edges (`depends_on`, `part_of`, `replaces`, `merged_into`). Prose in `requirements.md`, `tasks.md`, `handoff.md`, and lenses can only reference other specs by typing their name in plain text — no navigation, no validation, no graph contribution.

Rowboat's plain-markdown-vault-with-backlinks pattern (and Obsidian's wider ecosystem) shows the value of inline `[[wiki-links]]`: prose stays prose, but references become a navigable web. Zettelgeist's name itself invokes the zettelkasten model — atomic notes with their own outgoing links — so this is on-brand format evolution, not a bolt-on.

## Acceptance criteria

The system, when parsing spec body content:

- WHEN a line contains the token `[[<spec-name>]]` where `<spec-name>` matches the spec-folder regex `[a-z0-9-]+`
- THE SYSTEM SHALL collect that as a wiki-link reference on the containing spec
- AND surface the references on the `Spec` data type (e.g. `wikiLinks: ReadonlyArray<string>`)

The system, in the viewer:

- WHEN rendering a spec body via markdown
- THE SYSTEM SHALL transform `[[<spec-name>]]` into a clickable link to that spec's detail view
- AND if the referenced spec does not exist, render the link with a visual "missing" affordance (struck through or red)

The system, in INDEX.md:

- WHEN regenerating
- THE SYSTEM MAY surface wiki-link relationships in a separate "Backlinks" graph section (a separate Mermaid block, distinct from the `depends_on` graph) — or annotate the existing graph with a different edge style
- The exact rendering is implementation-defined; the format MUST normatively define the syntax + that references are collected

The system, in conformance fixtures:

- WHEN a new fixture exercises wiki-links
- THE SYSTEM SHALL include at least one fixture with both valid and broken wiki-link references and assert the parser collects them correctly

## Out of scope

- Aliased wiki-links (`[[spec-name|display text]]`) — defer to a follow-up if there's demand.
- Reverse-link queries from the CLI (would be useful — defer; the viewer's graph view covers the navigation case).
- Wiki-links to non-spec entities (people, decisions) — defer; the format is spec-centric.

## References

- Plan 1's design doc §13 "Future work" already references "richer non-text content in requirements.md" — wiki-links fit under that umbrella but are simpler than image embeds or decision tables.
- [`packages/core/src/types.ts`](../../packages/core/src/types.ts) — `Spec` type needs the new `wikiLinks` field.
- [`packages/core/src/loader.ts`](../../packages/core/src/loader.ts) — collection point.
- [`packages/viewer/src/views/detail.ts`](../../packages/viewer/src/views/detail.ts) — render transformation.
