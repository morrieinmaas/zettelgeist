---
"@zettelgeist/core": minor
"@zettelgeist/cli": minor
"@zettelgeist/mcp-server": minor
---

Per-actor `.claim-<actor>` files for distributed-safe spec claiming.

`claim_spec({name, agent_id})` now writes `specs/<name>/.claim-<sanitized-slug>` (filesystem-sanitized from `agent_id`) instead of the single-actor `specs/<name>/.claim`. Two machines claiming the same spec concurrently no longer hit a git merge conflict — they produce two distinct files. `release_spec({name, agent_id})` removes only the caller's per-actor file, leaving other actors' claims intact.

Read-time back-compat: legacy single `.claim` files from v0.1 are still recognised — both shapes contribute to `RepoState.claimedSpecs`. `release_spec` without `agent_id` falls back to removing the legacy file.

Side effect: CLI and MCP read paths now actually populate `RepoState.claimedSpecs` from disk via the new `scanClaimedSpecs()` helper — so claimed specs correctly derive to `in-progress`, closing a long-standing v0.2 backlog item.

New exports from `@zettelgeist/core`: `scanClaimedSpecs`, `sanitizeAgentId`.
