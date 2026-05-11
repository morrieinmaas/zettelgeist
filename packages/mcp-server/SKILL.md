---
name: zettelgeist
description: Stateful agent surface for Zettelgeist — markdown-based spec-driven project management. Lists, reads, mutates specs in any Zettelgeist repo via standard MCP tools.
---

# zettelgeist MCP server

## When to use

You're operating in a repository that contains a `.zettelgeist.yaml` file. Specs are folders under the configured `specs_dir` (default `specs/`). Use these tools to read state and make commits to spec files.

## Requirements

- Node 20+, the `zettelgeist-mcp` binary installed.
- The repo has been initialized as a Zettelgeist repo (commit `.zettelgeist.yaml` manually, or run `zettelgeist install-hook` after creating the file).

## Agent guidance

- **Prefer `list_specs` first** to understand what's in the repo before reading individual specs.
- **Always claim before mutating**: `claim_spec` writes a `.claim` file; release on completion.
- **Never edit `INDEX.md` directly**: it's regenerated. Edit `requirements.md`, `tasks.md`, etc., and the next mutating tool call regenerates it.
- **Use machine-readable error codes**: `E_CYCLE`, `E_INVALID_FRONTMATTER`, `E_EMPTY_SPEC` are the v0.1 codes. Check `validate_repo` before assuming a write succeeded.
- **For HTML reports/explainers**: use `prepare_synthesis_context` to get shaped data, synthesize the HTML in your own context window, then call `write_artifact` to store it. The MCP never calls an LLM itself.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `list_specs` | — | array of `{name, status, progress, blockedBy}` |
| `read_spec` | `{name}` | full spec contents (all files) |
| `read_spec_file` | `{name, relpath}` | one file's content |
| `write_spec_file` | `{name, relpath, content}` | new commit SHA |
| `tick_task` | `{name, n}` | new commit SHA |
| `untick_task` | `{name, n}` | new commit SHA |
| `set_status` | `{name, status, reason?}` | new commit SHA |
| `patch_frontmatter` | `{name, patch}` (patch is `Record<string, unknown>`; `null` values delete keys; `status` / `blocked_by` are forbidden — use `set_status`) | new commit SHA |
| `claim_spec` | `{name, agent_id?}` | acknowledged |
| `release_spec` | `{name}` | acknowledged |
| `write_handoff` | `{name, content}` | new commit SHA |
| `regenerate_index` | — | new commit SHA (or null if no change) |
| `validate_repo` | — | array of validation errors |
| `install_git_hook` | `{force?}` | acknowledged |
| `prepare_synthesis_context` | `{scope: {kind: "all" \| "spec" \| "recent", ...}}` | markdown bundle + derived state for HTML synthesis |
| `write_artifact` | `{name, html, commit?}` | path of the written file (under `.zettelgeist/exports/` or `docs/exports/`) |

## Examples

**Claim → tick → handoff → release**

```
list_specs
read_spec({name: "user-auth"})
claim_spec({name: "user-auth", agent_id: "agent-1"})
tick_task({name: "user-auth", n: 1})
tick_task({name: "user-auth", n: 2})
write_handoff({name: "user-auth", content: "Tasks 1-2 complete; tests written; PR open."})
release_spec({name: "user-auth"})
```

**Mark a spec as blocked**

```
set_status({name: "payment-flow", status: "blocked", reason: "waiting on IDP creds"})
```

**Clear an explicit status override**

```
set_status({name: "payment-flow", status: null})
```

**Generate an HTML status report**

```
prepare_synthesis_context({scope: {kind: "recent", days: 7}})
// Agent synthesizes HTML in its own context window
write_artifact({name: "weekly-status-2026-05-09", html: "<!DOCTYPE html>..."})
```

## Error model

Tool errors return an MCP error response with the underlying error message. For format-layer errors (cycles, invalid frontmatter, empty specs), the validation result includes a structured array with `code`, `path`, and `detail`.
