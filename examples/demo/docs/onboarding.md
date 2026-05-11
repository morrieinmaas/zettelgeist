# Onboarding

> Anyone joining this project — human or agent — should be able to ship their
> first commit before lunch.

## Your first 30 minutes

- [x] Clone the repo and `pnpm install`.
- [ ] Open the Zettelgeist Board (`just demo` or, in VSCode, the Activity Bar
      icon → click any spec).
- [ ] Find a `planned` spec marked with `#help-wanted` in the tasks. Pick one.
- [ ] Drop a `.claim` file in the spec directory (or call `claim_spec` via MCP).

## How work flows here

1. **Specs are the unit of work.** One folder per spec. The contract is
   acceptance criteria in `requirements.md` and the task list in `tasks.md`.
2. **Tick tasks as you go.** Each tick is a git commit. Reviewers can
   reconstruct your trail from `git log specs/<name>/`.
3. **Hand off when you stop.** Even mid-work — write what you did, what's
   next, and any open questions in `handoff.md`. The next session (yours or
   someone else's) picks up cold.
4. **Status is mostly derived.** Don't manually set it unless you're blocked
   or cancelling. Tick the right tasks; the status follows.

## Conventions

- Frontmatter fields you'll see: `status`, `depends_on`, `part_of`, `pr`,
  `branch`, `worktree`, `blocked_by`.
- Wiki-style links between specs: `[[other-spec]]` in any markdown body
  becomes a clickable cross-reference.
- Task tags: `#human-only` (no agent should attempt), `#agent-only` (humans
  should leave alone), `#skip` (excluded from progress counting).

## See also

- [[user-auth]] — a representative in-progress spec
- [[admin-dashboard]] — a planned spec with explicit `depends_on`
- [architecture](#/docs/docs/architecture.md) — the bigger picture
