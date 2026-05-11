# Handoff — per-command-help — 2026-05-11

## What was done this session

- All 5 tasks ticked.
- Added a `HELP` string export to each of the 5 command modules
  (`regen`, `validate`, `install-hook`, `serve`, `export-doc`).
- Wired `bin.ts` to dispatch `--help` to the appropriate command's HELP
  via a `COMMAND_HELP` lookup table; global HELP remains the fallback
  when `topic` is null or unknown.
- Verified existing behaviour: `zettelgeist nonsense --help` is parsed
  by the router as `unknown-command` (not `help`), so `bin.ts` writes
  the global help to stderr and exits 2. This satisfies the AC
  ("non-zero exit code").
- Added `packages/cli/tests/help.test.ts` with 7 tests: one per
  command (5), one for unknown-command --help, one for no-args.
- Updated the top-level `README.md` with a new "CLI commands" section
  pointing readers at `zettelgeist <command> --help`.
- Added a "Run `zettelgeist <command> --help` for command-specific
  help." footer to the global HELP banner in `bin.ts`.

## Verification

- `pnpm -r typecheck`: clean across 7 packages.
- `pnpm -r test`: 214 tests passing (8 + 36 + 12 + 53 + 11 + 68 + 26).
- `pnpm conformance`: 11 fixtures passing.
- Manual: `node packages/cli/dist/bin.js regen --help` prints
  regen-specific help and exits 0. `nonsense --help` prints global
  help to stderr and exits 2.

## Files changed

- `packages/cli/src/commands/regen.ts` — added `HELP` export
- `packages/cli/src/commands/validate.ts` — added `HELP` export
- `packages/cli/src/commands/install-hook.ts` — added `HELP` export
- `packages/cli/src/commands/serve.ts` — added `HELP` export
- `packages/cli/src/commands/export-doc.ts` — added `HELP` export
- `packages/cli/src/bin.ts` — import HELPs, build `COMMAND_HELP`
  lookup, dispatch in the `inv.kind === 'help'` branch, add footer
  to global HELP banner
- `packages/cli/tests/help.test.ts` — new test file (7 tests)
- `README.md` — new "CLI commands" section
- `specs/per-command-help/tasks.md` — ticked all 5 tasks

## Notes for future sessions

- `HELP` strings are simple template literals. The spec explicitly
  marked auto-generation from a schema as out of scope; v0.3 may
  revisit this if the help drifts from the actual flag set.
- The unknown-command exit code is 2 (matching the existing bin.ts
  behaviour for unknown commands), not 1 as suggested in the
  orchestrator brief. The AC only requires "non-zero", so this is
  fine; changing it would be an unrelated regression.
- The new test file gates itself on `existsSync(BIN)` via
  `describe.skip` so a fresh checkout without `pnpm --filter
  @zettelgeist/cli build` does not get spurious failures. CI builds
  the CLI before running tests, so this only affects local first runs.
