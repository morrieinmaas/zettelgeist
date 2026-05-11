# Architecture

> Narrative documentation lives next to the specs. The Docs view in Zettelgeist
> renders any `.md` file under this `docs/` folder.

## Overview

This demo represents a small SaaS platform team — call it "Acme" — that runs
its work through Zettelgeist. The specs you see on the [Board](#/) are real
shapes of work the team is tracking: user authentication, billing, an admin
dashboard, a webhook system.

## How the team uses Zettelgeist

- **Engineers** open the Board, pick up the topmost In-progress spec, write
  code against its tasks, tick checkboxes as they go.
- **PMs** drop new draft specs straight into the repo, set `part_of:` to the
  epic, link related work with `[[wiki-style]]` references. They never leave
  the markdown.
- **An on-call agent** (Claude Code, via the MCP server) handles smaller
  cleanup tasks overnight. It claims a spec, edits files, writes a handoff,
  and releases the claim before signing off.
- **Reviewers** open the dependency graph to see what's blocked on what.

## File layout

- `specs/<name>/` — one folder per spec, see [[user-auth]] as an example.
- `specs/INDEX.md` — generated table + dependency graph, never hand-edited.
- `docs/*.md` — narrative documentation (this file, [[onboarding]]).
- `.zettelgeist.yaml` — repo config (format version, viewer theme).
- `.zettelgeist/` — generated artifacts (regen cache, optional render-template
  overrides). Gitignored.

## See also

- [[onboarding]] — how to get a new engineer or agent up to speed
- [Format spec](../../../spec/zettelgeist-v0.1.md) (in the parent repo)
