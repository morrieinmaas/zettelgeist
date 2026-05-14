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
pnpm -r test          # 309 unit + integration tests across all packages
pnpm conformance      # 42 format conformance fixtures
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
