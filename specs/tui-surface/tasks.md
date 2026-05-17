- [x] 1. `packages/tui` scaffolded with Ink + React + esbuild bundler
- [x] 2. In-process backend in `src/backend.ts` using `@zettelgeist/core` directly
- [ ] ~~`--remote` flag~~ — deferred. In-process is fast enough and avoids needing `zettelgeist serve` running. Add when there's a real "TUI from another machine" use case.
- [x] 4. Board view: 7 status columns, hjkl + arrow nav, status-aware coloring, card counts, empty-state hint
- [x] 5. Detail view: tab bar (requirements/tasks/handoff/lenses), spec-picker when nothing open, task progress count in tab label
- [x] 6. Graph view: layered ASCII layout via DFS longest-path; edges listed below; cycles flagged in red
- [x] 7. Docs view: tree of `docs/*.md` (recursive walk); inline rendering on open
- [x] 8. Command palette (`?`): filter-as-you-type, arrow nav, enter to run, esc to close
- [ ] ~~Open-in-`$EDITOR` flow~~ — deferred to v0.2.x. The current detail view is read-only; ticking tasks goes through the CLI today.
- [ ] ~~Config file (`~/.config/zettelgeist/tui.toml`)~~ — deferred. Default behaviour is reasonable; revisit if users want theme/keybinding overrides.
- [x] 11. 15 tests (ink-testing-library) covering all 5 views + the in-process backend wired to `@zettelgeist/core`
- [ ] README + screenshots — deferred (screenshots need a terminal recording step).
- [x] 13. New package `@zettelgeist/tui` with `zg-tui` binary; changeset entry below

### Known limitations / v0.2.x candidates

- TUI is **read-only** for now. Mutations (tick task, set status, claim) go through CLI / MCP / web viewer. Adding writes is straightforward but interacts with the merge-driver work — better as a follow-up.
- No `$EDITOR` integration yet.
- No mouse support, no resize-aware layout polish, no markdown rendering (raw text in detail bodies).
