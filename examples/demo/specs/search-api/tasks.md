# Tasks

- [x] 1. Pick the storage engine (Postgres tsvector + GIN — keep the stack flat)
- [ ] 2. Add the `search_documents` materialized view + refresh trigger
- [ ] 3. Implement the `/api/search` endpoint with cursor pagination
- [ ] 4. Wire the ACL filter into the SQL query (not post-hoc)
- [ ] 5. Add the header search field to the app shell #agent-only
- [ ] 6. Benchmark p95 latency at 100, 1K, 10K, 100K result-set sizes
