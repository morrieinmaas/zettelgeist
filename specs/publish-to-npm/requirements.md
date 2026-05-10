---
depends_on: []
part_of: v0.2
---
# Publish to npm

## Why

`@zettelgeist/cli`, `@zettelgeist/mcp-server`, and `@zettelgeist/core` are publish-ready (correct `files`, `exports`, `bin`, and `main` fields) but have never been pushed to the npm registry. Until they ship, the README install instructions are aspirational and contributors can't `npx @zettelgeist/cli init`.

## Acceptance criteria

The system, on a successful publish:

- WHEN a maintainer runs the documented publish flow
- THE SYSTEM SHALL publish `@zettelgeist/core`, `@zettelgeist/mcp-server`, and `@zettelgeist/cli` to npm at version `0.1.0`
- AND the dependency order is core, then mcp-server, then cli
- AND each tarball excludes source maps, tests, and tsconfig files via `files`

The system, after publish:

- WHEN a user runs `npx @zettelgeist/cli init` against an empty directory
- THE SYSTEM SHALL bootstrap a working `.zettelgeist.yaml` and empty `specs/`
- AND no peer-dependency warnings appear

The system, on git side:

- WHEN the publish completes
- THE SYSTEM SHALL be tagged `v0.1.0` and the tag pushed

## Out of scope

- A CI-driven release workflow (manual publish is acceptable for 0.1.0).
- The `npx create-zettelgeist-repo` scaffolder (separate item).

## References

- [package.json](../../package.json) at repo root
- README "Install" section
