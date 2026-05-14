# Changesets

This directory drives the release pipeline.

## Adding a changeset

Run `pnpm changeset` after making a user-facing change. The CLI asks:
- Which packages were affected (`@zettelgeist/core`, `@zettelgeist/cli`, `@zettelgeist/mcp-server`)
- Whether the change is `patch`, `minor`, or `major` per package
- A short summary (this lands in `CHANGELOG.md`)

It writes a markdown file to `.changeset/<name>.md` — commit it with your PR.

## What gets released

The release workflow (`.github/workflows/release.yml`) watches `main`. When it sees pending changesets it opens a **"Version Packages" PR** that bumps versions and rewrites `CHANGELOG.md` entries. When that PR merges, the workflow runs `pnpm release` which publishes the bumped packages to npm.

Push to main alone does NOT trigger a release. Only the Version Packages PR merge does.

## Ignored packages

`viewer`, `fs-adapters`, `git-hook`, `conformance-harness`, and the VSCode extension (`zettelgeist`) are listed under `ignore` in `config.json` — they're not published through changesets:

- `viewer`, `fs-adapters`, `git-hook` are bundled into the CLI and MCP server; no separate release.
- `conformance-harness` is a test runner; not for distribution.
- The VSCode extension goes to Open VSX / VS Code Marketplace via a separate flow.
