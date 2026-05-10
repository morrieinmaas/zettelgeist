# Agent guidance

This repository implements the Zettelgeist v0.1 format. If you're an agent (Claude Code, Cursor, Codex, etc.) working in this repo, here's the relevant context:

## What it is

A pnpm monorepo with 6 packages building three artifacts: a Node CLI (`@zettelgeist/cli`), a stdio MCP server (`@zettelgeist/mcp-server`), and an HTML viewer (bundled into the CLI). All build on a pure-TS format core (`@zettelgeist/core`).

See [README.md](README.md) for end-user documentation and [docs/architecture.md](docs/architecture.md) for package layout.

## How to operate productively

- **Run tests before changes**: `pnpm -r test && pnpm conformance && pnpm -r typecheck`.
- **Use the MCP server itself if you have it configured**: see [packages/mcp-server/SKILL.md](packages/mcp-server/SKILL.md) for the tool surface.
- **Workflow conventions**: Conventional Commits (`feat(scope):` etc.). NEVER add `Co-Authored-By` or AI attribution lines to commits.
- **Pre-commit hook**: This repo has a Zettelgeist pre-commit hook installed. It runs `zettelgeist regen --check` before allowing commits. If your change makes INDEX.md stale, run `pnpm --filter @zettelgeist/cli build && node packages/cli/dist/bin.js regen` and stage the result.
- **Eat the dogfood**: planning new work? Add a spec under `specs/<name>/` (you can use the MCP `write_spec_file` tool if it's wired up). Tasks go in `tasks.md`, requirements in `requirements.md`.

## What NOT to do

- Don't commit secrets, .env files, credentials.
- Don't bypass `--no-verify` on git commits unless explicitly told to.
- Don't restructure the package layout. Don't refactor unrelated code "while you're in there."
- Don't add LLM API calls to `@zettelgeist/core` or any backend — the agent's context window does synthesis.

## Useful entry points

- Spec: [spec/zettelgeist-v0.1.md](spec/zettelgeist-v0.1.md)
- Conformance fixtures: [spec/conformance/fixtures/](spec/conformance/fixtures/)
- Format core: [packages/core/src/](packages/core/src/)
- MCP tools: [packages/mcp-server/src/tools/](packages/mcp-server/src/tools/)
- Viewer entry: [packages/viewer/src/main.ts](packages/viewer/src/main.ts)
