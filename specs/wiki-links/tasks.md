# Tasks

- [ ] 1. Add `wikiLinks: ReadonlyArray<string>` to the `Spec` type in `packages/core/src/types.ts`
- [ ] 2. Extract wiki-link references in `loadSpec` (regex over all body content: requirements, tasks, handoff, lenses values)
- [ ] 3. Spec doc update: add a new section "§N. Wiki-style links" describing syntax + collection rule
- [ ] 4. Add a conformance fixture exercising valid + broken wiki-link refs
- [ ] 5. Viewer: transform `[[name]]` into a clickable router-link in `detail.ts` markdown rendering
- [ ] 6. Viewer: distinguish missing-target wiki-links visually (e.g. `class="zg-wikilink-missing"`)
- [ ] 7. (optional) Surface wiki-link reverse edges in `INDEX.md`'s graph block
- [ ] 8. Update the format spec's Appendix A rule→fixture map
