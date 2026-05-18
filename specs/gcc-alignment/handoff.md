# Handoff — v0.3 design discussion

This spec captures a design discussion that took place after v0.2.0 shipped to npm. The next agent picking this up should read this file in full before starting on `tasks.md` — the *why* and *what we explicitly rejected* matter as much as the *what to build*.

## Origin

The user shared the [Git-Context-Controller paper (Wu et al., 2026, arXiv:2508.00031)][gcc] as inspiration. The first pass at a v0.3 plan over-indexed on adopting GCC's full model. The user pushed back on two specific points, which set the constraints for the design that landed:

1. **"LLM-call billing in the data-plane is a bad idea — we shouldn't do that."** Hard constraint. Any v0.3 proposal that puts an LLM call on the MCP write path is out. This rules out:
   - GCC's COMMIT operation as-described (regenerates a rolling summary each commit)
   - The original "promote handoff.md to recursive-fold structure on release" idea
   - LLM-driven log compaction
   All write-path code must be deterministic. The cost story is "git operations only; latency in milliseconds, billing in zero."

2. **"Pre-1.0 we are free to break the spec and API."** This relaxed my own conservatism. v0.3 can add `.log.md` to the format with a §9.4 amendment without worrying about backward-compat ceremony. The format version stays at 0.2; the addition is additive surface.

[gcc]: https://arxiv.org/abs/2508.00031

## What we adopted from GCC

The ablation in Table 3 of the GCC paper attributes **+6.2pp of the SWE-Bench Verified gain to the combination of `log.md` (fine-grained OTA traces) + windowed CONTEXT retrieval over them.** That's the largest single feature-combination delta in their study — by a margin. Everything else (BRANCH/MERGE, metadata, RoadMap+COMMIT) adds +1.9 to +2.5 each.

We're adopting that pair. In our shape:
- `specs/<name>/.log.md` for the trace (per-spec, not per-branch; dotfile-prefixed to keep editors quiet)
- `zettelgeist context [...]` for the windowed retrieval (CLI + MCP tool)

## What we rejected from GCC

- **BRANCH/MERGE as reasoning trajectories.** GCC's BRANCH creates an isolated reasoning workspace inside a single project. For multi-machine multi-day project work (Zettelgeist's actual use case), git branches plus our merge drivers already cover this. Adding a parallel branching model would double the mental load for a +2.4pp benefit on a benchmark that doesn't match our workload anyway.

- **The recursive-fold rolling summary in commit.md.** This is the elegant mechanism in GCC — each COMMIT writes a 3-block entry where the "Previous Progress Summary" is recursively folded from the prior commit's summary + last commit's contribution. It keeps the summary bounded while preserving narrative continuity. But the fold requires an LLM call. Constraint #1 kills it.

- **The `--commit <sha>` flag.** First-pass design had it. The realisation was: every cycle release marker in `.log.md` already carries `sha=...` in plain text. Agents who want "the cycle that produced commit abc1234" can `grep "sha=abc1234" specs/*/.log.md` — which is actually more informative than a wrapper (it tells you *which spec* the sha belonged to). We don't need to build it. This also dissolves the "what if the sha isn't fetched locally" problem entirely — there are no remote-state semantics in the API.

## What we rejected from my own first drafts

- **SWE-Bench-Verified harness as a ship gate.** I proposed running 50 SWE-Bench tasks with vs without `@zettelgeist/mcp-server` to validate the v0.3 lift. The user pushed back asking *why*. Real answer: SWE-Bench tests single-shot single-issue ~1hr bug-fixing — the *opposite* of Zettelgeist's value prop (multi-session, multi-agent, multi-day work). A null result there wouldn't actually invalidate v0.3 for our real use case; it'd just mean we measured the wrong thing. Dropped from must-do; deferred indefinitely. If a citable result becomes valuable later, build a *synthetic long-horizon* eval instead (agent A makes progress in session 1, agent B in session 2 picks up cold).

- **Auto-summarize-on-release flag.** Original idea was an opt-in `auto_summarize: true` config that would LLM-fold `handoff.md` on each release. Per constraint #1: dropped entirely. `handoff.md` stays one-shot.

## Key design decisions that shaped the API

### One per action, no prose

Each `.log.md` entry is a single line: `- <iso-time> · agent=X · tick_task(2)`. No observation, no thought, no free-form note. That keeps the writer deterministic and the file greppable. Agents who want richer reflection can still use `handoff.md` — that surface didn't change.

### Cycle as the retrieval unit, not the line

`context --log` returns a *cycle* (claim → ... → release), not a slice of lines. Why: a cycle is the natural unit of agent work. K=1 (most recent cycle) is what a resuming agent needs. K=N with `--offset N` is the scrolling primitive. Lines are too granular; cycles are the right level.

### Rotation by count, not by size

50 complete cycles per spec. Older cycles are dropped *whole* (not folded, not summarised). The git history is the authoritative long-term record — if you need older context, `git log specs/<name>/.log.md` is one command away. This is the deterministic equivalent of GCC's fold operation: instead of compressing, we drop and rely on git.

### Per-spec, not per-repo

Each spec's `.log.md` is independent. No global log file. This is consistent with how Zettelgeist treats specs as the unit of work and matches the GCC paper's per-branch logging structure (a branch in their world is a project subgoal, like a spec in ours).

## The open questions in requirements.md

There are three explicit "open questions" at the bottom of `requirements.md` that the implementing agent should resolve before writing code (or surface back to the user if uncertain):

1. **Effect or call in the log line?** Default: call only.
2. **Rotation cap scope?** Default: per-spec, 50 cycles.
3. **`context --log` semantics when a cycle is open?** Default: return the open cycle.

The defaults are reasonable starting points. If implementation surfaces a reason to change one, document it here and update `requirements.md`.

## How v0.3 connects to v0.2

v0.2 shipped:
- Per-actor `.claim-<agent>` files (no merge conflicts on concurrent claim)
- INDEX.md `merge=union` + post-merge regen
- `tasks.md` semantic merge driver
- `requirements.md` frontmatter 3-way merge driver
- `zettelgeist sync` command
- `@zettelgeist/tui` package

v0.3 builds *on top of* that infrastructure. `.log.md` files use the same dotfile-claim pattern. The MCP write tools that get `appendLogEntry` calls are the same tools that already do tmp+rename+commit. `zettelgeist context` mirrors `zettelgeist sync` in shape (CLI + MCP tool, structured JSON envelope).

Nothing in v0.3 invalidates v0.2 readers. A v0.2 client opening a v0.3 repo just doesn't see the `.log.md` files (walker ignores them).

## When to ship

Dogfood it. Use v0.3 for v0.3's own development — the `tasks.md` for this spec should accumulate ticked items via the real MCP tool, and the `.log.md` should fill up with real cycles. If after 2–4 weeks of that the "I'm a fresh agent and I'm context-blind" moments measurably decrease, ship 0.3.0. If they don't, the windowed-retrieval bet didn't pay off and we reconsider before releasing.

No formal benchmark, no Pass@1 lift target. Real-usage signal only.
