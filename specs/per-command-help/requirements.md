---
depends_on: []
part_of: v0.2
---
# Per-command CLI help

## Why

`zettelgeist <command> --help` is half-wired today: the router parses the flag and dispatches to the command, but the bin always prints the global help banner. Each command should have its own focused help text describing arguments, flags, and a one-line example.

## Acceptance criteria

The system, when a user requests per-command help:

- WHEN `zettelgeist <command> --help` runs for any registered command
- THE SYSTEM SHALL print help text specific to that command
- AND exit with code 0
- AND not execute the command's side effects

The system, when the user requests help for an unknown command:

- WHEN `zettelgeist nonsense --help` runs
- THE SYSTEM SHALL print the global help banner
- AND exit with a non-zero code

The system, in test coverage:

- WHEN the test suite runs
- THE SYSTEM SHALL include a `--help` assertion for every registered command

## Out of scope

- Auto-generating help from a schema (a manual help string per command is fine).
- Localisation.

## References

- [packages/cli/src/bin.ts](../../packages/cli/src/bin.ts) — current help handling
- [packages/cli/src/router.ts](../../packages/cli/src/router.ts) — already parses `--help`
