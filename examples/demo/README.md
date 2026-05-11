# Zettelgeist demo

A fully populated example repo to show off every viewer feature without setting
up your own. From the repo root:

```bash
just demo
```

or, if you don't have `just` installed:

```bash
pnpm demo
```

This builds the toolchain (if needed) and launches `zettelgeist serve` against
this directory on http://127.0.0.1:7681 (your browser should open automatically).

## What you'll see

- **10 specs** across all 7 status columns (Draft, Planned, In Progress, In
  Review, Done, Blocked, Cancelled).
- **Dependency graph**: the Graph tab renders the `depends_on` relationships
  via Mermaid.
- **`part_of` grouping**: identity, payments, growth, integrations, internal,
  search.
- **Inline tags**: `#human-only`, `#agent-only`, `#skip` on selected tasks —
  see the badges in the spec-detail Tasks tab.
- **Lenses**: `onboarding-tour` has design, business, and tech perspectives —
  see the Lenses tab.
- **Frontmatter overrides**: `payment-flow` is blocked with a reason;
  `email-notifications` is cancelled (superseded by `webhooks`).
- **Lifecycle pointer**: `webhooks` declares `replaces: email-notifications`.
- **Active claim**: `search-api` has a `.claim` file simulating an agent
  working on it.
- **Handoff notes**: `user-auth`, `subscription-mgmt`, and `webhooks` each
  carry a `handoff.md` showing how an agent or human signs off a session.

## Try

1. **Click a card** → opens spec detail with tabs.
2. **Drag a card to Blocked** → modal asks for a reason; on confirm, status
   changes + a commit lands.
3. **Tick a checkbox** → task flipped, `INDEX.md` regenerated, commit made.
4. **Visit `/graph`** → dependency graph rendered via Mermaid (lazy-loaded,
   bundled — works offline).
5. **Visit `/docs`** → renders this README plus any docs under
   `examples/demo/docs/`.

## Status distribution at a glance

| Status | Spec |
|---|---|
| draft | `billing-ui` |
| planned | `oauth-providers`, `admin-dashboard` |
| in-progress | `user-auth`, `webhooks`, `search-api` |
| in-review | `subscription-mgmt`, `onboarding-tour` |
| done | (requires the spec's commits to be merged to the default branch — none here yet) |
| blocked | `payment-flow` |
| cancelled | `email-notifications` |

Why no `done` spec in the demo: the format derives `done` only when the spec's
commits are merged to the default branch (§7 of the format spec). `status:
done` is **not** a valid frontmatter override; only `blocked` and `cancelled`
are. `subscription-mgmt` is the closest — all tasks ticked, waiting on PR
merge — and surfaces as `in-review`. Once you merge the relevant commits in
your own fork, regen will flip it to `done`.

## Notes on `.claim` files

A `.claim` file inside a spec folder signals an agent is actively working on
the spec. In normal repos `.claim` is gitignored (so claims don't pollute
git history). For this demo, we make a single targeted exception in the root
`.gitignore` so the demo's claim is reproducible:

```
.claim
!examples/**/.claim
```

This lets `examples/demo/specs/search-api/.claim` be tracked even though
the repo-wide rule still ignores claims everywhere else.

## Reset to clean state

Clicking around will make real commits to the demo's history (drag-to-blocked,
tick-task, handoff edits — all are normal git commits). To reset:

```bash
just demo-reset
```

This clears the regen cache and regenerates `INDEX.md`. To wipe accidental
viewer-driven commits, also run `git checkout -- examples/demo/` from the
repo root.

## Inspect via MCP

Point any MCP client (Claude Code, etc.) at `examples/demo/` and try:

- `list_specs` — all 10 with derived status
- `read_spec name: user-auth` — full content
- `prepare_synthesis_context scope: {kind: recent, days: 7}` — shaped context
  for an HTML report
- `tick_task name: user-auth n: 3` — flip a checkbox, produce a commit
- `validate_repo` — should return zero errors

Full tool list: [packages/mcp-server/SKILL.md](../../packages/mcp-server/SKILL.md).

## Why this lives outside the published packages

`examples/` is intentionally not part of any package's npm `files` allowlist
— it's a developer-facing artifact, never published. It exists so:

- Contributors can verify viewer/CLI/MCP behavior against realistic content.
- New users can clone the repo and see Zettelgeist in action with zero setup.
- The format spec's "clone the repo and you have the entire project board"
  claim is demonstrable.
