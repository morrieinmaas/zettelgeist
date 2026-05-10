# Tasks

- [ ] 1. Read MCP SDK v1.x docs for the `McpServer` builder API
- [ ] 2. Refactor `packages/mcp-server/src/server.ts` to use `McpServer.tool(...)` builder
- [ ] 3. Update each `tools/*.ts` if any signatures change
- [ ] 4. Run all mcp-server unit tests and the stdio e2e — must pass unchanged
- [ ] 5. Manually verify with Claude Code that every tool still resolves
- [ ] 6. Drop any now-unused dependencies (e.g. `zod-to-json-schema` if subsumed)
