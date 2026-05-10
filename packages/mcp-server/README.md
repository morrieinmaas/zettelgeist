# @zettelgeist/mcp-server

Stdio MCP server exposing 15 tools for agents operating on [Zettelgeist v0.1](../../spec/zettelgeist-v0.1.md) repositories.

## Install

```bash
npm i -g @zettelgeist/mcp-server
```

## Configure your agent host

### Claude Code

```json
{
  "mcpServers": {
    "zettelgeist": {
      "command": "npx",
      "args": ["@zettelgeist/mcp-server"]
    }
  }
}
```

### Cursor / Codex

Same shape — point `command` at `npx` (or `zettelgeist-mcp` once installed globally) with the `@zettelgeist/mcp-server` package as the argument.

## Tool surface

See [SKILL.md](SKILL.md) for the full agent-readable manifest with arg/return shapes. Brief summary:

| Group | Tools |
|---|---|
| Read | `list_specs`, `read_spec`, `read_spec_file`, `validate_repo` |
| Write | `write_spec_file`, `write_handoff`, `tick_task`, `untick_task`, `set_status` |
| State | `claim_spec`, `release_spec`, `regenerate_index`, `install_git_hook` |
| Synthesis | `prepare_synthesis_context`, `write_artifact` |

Every mutating tool writes to a markdown file and creates a git commit; reads parse the same files via `@zettelgeist/core`.

## Synthesis context tools (the agent-driven HTML report flow)

`prepare_synthesis_context` returns a shaped bundle (markdown contents + derived state for a scope: `all`, a specific `spec`, or `recent` activity). The agent then uses its own context window to synthesize an HTML report. `write_artifact` stores the resulting HTML under `.zettelgeist/exports/` (or `docs/exports/` when `commit: true` is passed). The MCP server itself never calls an LLM — synthesis happens in the agent's context.

## License

Apache-2.0
