---
depends_on: []
part_of: v0.2
---
# MCP SDK migration

## Why

`@zettelgeist/mcp-server` currently uses the legacy `Server` class from `@modelcontextprotocol/sdk`. The SDK ships a higher-level `McpServer` builder that is the supported path forward; the current `Server.setRequestHandler(ListToolsRequestSchema, …)` pattern surfaces as deprecated in IDE diagnostics. Migrating now keeps us on the supported API before more tools accrete on the legacy surface.

## Acceptance criteria

The system, when initialized:

- WHEN the MCP server starts
- THE SYSTEM SHALL register all 15 tools via the `McpServer.tool(name, schema, handler)` builder API
- AND continue to expose the same tool surface (same names, same input and output schemas)
- AND pass all existing mcp-server unit tests and the e2e stdio test without test changes

The system, on tool invocation:

- WHEN any tool is called via JSON-RPC
- THE SYSTEM SHALL produce byte-identical responses to v0.1 behaviour for the same inputs

The system, on shutdown:

- WHEN the server receives SIGINT or stdin EOF
- THE SYSTEM SHALL close transports cleanly with the same exit semantics as v0.1

## Out of scope

- Adding new tools (separate spec).
- Changing tool input/output schemas (separate spec).
- Adding the optional events capability (covered by `events-catalogue`).

## References

- [MCP TypeScript SDK docs](https://modelcontextprotocol.io/typescript-sdk)
- [packages/mcp-server/src/server.ts](../../packages/mcp-server/src/server.ts) — current legacy impl
