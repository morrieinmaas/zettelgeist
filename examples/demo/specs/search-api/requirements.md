---
depends_on: []
part_of: search
---
# Cross-account search API

## Why

Users with multiple projects can't currently search across them — they have
to open each one and use the per-project search. This was tolerable at 2-3
projects per user; we now see power users with 40+. A single cross-project
search endpoint plus a header search field would close the gap.

## Acceptance criteria

The system, for any authenticated user:

- [ ] WHEN a user issues `GET /api/search?q=<term>`
- [ ] THE SYSTEM SHALL return matching records (projects, tasks, comments) from
  every project the user has read access to
- [ ] AND rank results by recency * relevance with a documented scoring formula
- [ ] AND paginate at 50 results per page with cursor-based pagination
- [ ] AND respond within 300ms p95 for typical queries

The system, for access control:

- [ ] WHEN building the result set
- [ ] THE SYSTEM SHALL exclude records the user does not have read access to,
  enforced at the storage layer (not just filtered after-the-fact)

## Out of scope

- Saved searches / search alerts (separate spec).
- Multi-account search across organizations.

## References

- internal: support ticket cluster "I can't find $thing" (the largest cluster Q1)
- ADR-014: storage-level access enforcement
