# Tasks

- [ ] 1. Define the `views` schema in `.zettelgeist.yaml` (zod schema in core/config)
- [ ] 2. Implement filter evaluation: `status`, `part_of`, `blocked`, `stale` (with `any` / `all` composition)
- [ ] 3. Extend `regenerateIndex` to render one section per view in the auto region
- [ ] 4. Add conformance fixtures: one repo with 2 views; expected INDEX.md byte-exact
- [ ] 5. Update the format spec doc with §N "Saved views"
- [ ] 6. Viewer: surface view filters as chips above the board (filter the visible cards)
- [ ] 7. MCP: optional `list_views()` tool returning the configured view names + counts
- [ ] 8. Update demo's `examples/demo/.zettelgeist.yaml` with 2 example views to show off the feature
