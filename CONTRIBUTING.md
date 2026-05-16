# Contributing to Zettelgeist

## Setup

```bash
git clone https://github.com/morrieinmaas/zettelgeist.git
cd zettelgeist
pnpm install
```

You need Node 20+, pnpm 9+, and git 2.30+.

## Run the test suite

```bash
pnpm -r test          # 354 unit + integration tests across all packages
pnpm conformance      # 44 format conformance fixtures
pnpm -r typecheck     # all packages
```

## Build

```bash
pnpm --filter @zettelgeist/viewer build       # builds the HTML/CSS/JS bundle
pnpm --filter @zettelgeist/cli build          # bundles the CLI binary
pnpm --filter @zettelgeist/mcp-server build   # bundles the MCP server
```

## Run locally

```bash
node packages/cli/dist/bin.js regen
node packages/cli/dist/bin.js serve
```

Or wire up `pnpm link --global` if you want `zettelgeist` on your PATH.

## Workflow

- All work happens in markdown specs under `specs/` — eat your own dogfood.
- Pre-commit hook (run `zettelgeist install-hook` once) keeps `INDEX.md` current.
- Use Conventional Commits: `feat(scope): description`, `fix(scope): description`, `docs: ...`, `chore: ...`, `test: ...`, `refactor: ...`.
- Never add `Co-Authored-By: Claude` or "Generated with AI" to commit messages.
- Run `pnpm -r test && pnpm conformance` before opening a PR.

## Releasing

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and npm publish. Releases happen automatically via [`.github/workflows/release.yml`](.github/workflows/release.yml) — but only when the "Version Packages" PR is merged. A regular feature merge to `main` does NOT publish.

For any user-facing change to `@zettelgeist/core`, `@zettelgeist/cli`, or `@zettelgeist/mcp-server`:

```bash
pnpm changeset              # interactive: pick packages, bump level, summary
git add .changeset
git commit -m "..."
```

The summary line becomes the entry in each affected package's `CHANGELOG.md`. Keep it short and user-focused — what changed, not how.

The flow once merged:

1. Push to `main` with changesets present → bot opens **"Version Packages" PR** that bumps versions and rewrites changelogs.
2. Merge the Version Packages PR → release workflow publishes the bumped packages to npm.
3. Multiple changesets accumulate over multiple PRs and ship together when the Version PR is merged. The bot keeps the PR up to date as more changesets land.

Skip a changeset only for: pure docs, internal refactors with no surface change, test-only diffs, CI tweaks. If you forget on a real change, the release workflow on `main` simply won't open a Version PR — nothing breaks, but the change ships in the next release that does include a changeset (which is usually fine).

The VS Code extension follows a separate publishing flow (manual + tag-based) — not part of changesets. The `viewer`, `fs-adapters`, `git-hook`, and `conformance-harness` packages are workspace-internal and not published to npm; they're listed in `.changeset/config.json` under `ignore`.

## Architecture

See [docs/architecture.md](docs/architecture.md) for package layout and data flow.

## Adding a new format rule

1. Add the rule to `spec/zettelgeist-v0.1.md` (in the appropriate section).
2. Add a conformance fixture at `spec/conformance/fixtures/NN-rule-name/` with `input/` and `expected/` subdirectories.
3. Update Appendix A's rule-to-fixture map.
4. Implement in `@zettelgeist/core`. Run `pnpm conformance` until your fixture passes.
5. Make sure all existing fixtures still pass.

## Adding a new MCP tool

1. Define a `ToolDef<I, O>` in the appropriate `packages/mcp-server/src/tools/{read,write,state,synthesis}.ts`.
2. Add unit tests in `packages/mcp-server/tests/tools/`.
3. Register in `packages/mcp-server/src/bin.ts`.
4. Document in `packages/mcp-server/SKILL.md`.

## Adding a new CLI command

1. Add a handler in `packages/cli/src/commands/<name>.ts`.
2. Add it to the `KNOWN_COMMANDS` set in `packages/cli/src/router.ts`.
3. Wire it in `packages/cli/src/bin.ts`'s switch statement.
4. Update `packages/cli/README.md`.

## Reporting bugs

Open an issue with reproduction steps. If it's a format-spec ambiguity, propose the rule + a fixture in the issue.

## Sign-off

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) — by adding `Signed-off-by: Your Name <you@example.com>` to your commit messages (e.g. `git commit -s`) you affirm that you have the right to submit the contribution under the project's license. The sign-off is not enforced by a bot today; if you forget, a maintainer may ask you to amend.

## License

By contributing, you agree that your contributions are licensed under Apache-2.0.
