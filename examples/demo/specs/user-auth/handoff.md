# Handoff — user-auth — 2026-04-22

## What was done this session

- Completed audit of the v1 session-cookie path. Findings written up in `lenses/tech.md`.
- Wired SAML 2.0 middleware into `packages/auth/saml.ts` using `@node-saml/node-saml`. Tested against the staging IDP (Okta dev tenant).
- Confirmed CSRF middleware is already in place for the new session path; no change needed there.
- Drafted OIDC scaffolding under `packages/auth/oidc.ts` but didn't wire it yet — that's task 3.

## State of the world

- SAML login works end-to-end in `pnpm dev`. Try `admin@acme-test.example` / IDP password.
- OIDC config file (`config/oidc.json.example`) is in the repo but not loaded yet.
- The integration test suite from task 4 is blocked on getting a stable IDP test account that
  isn't shared with the staging tenant. I emailed IT on 2026-04-22 — no reply yet.

## Notes for the next session

- Task 3 (OIDC) is the natural next pickup. The PKCE flow is the easier of the two paths;
  start there. Authorization code without PKCE is for the legacy IDPs we promised one
  enterprise customer; do that second.
- Don't merge task 4 until legal has signed off on the data retention copy (task 5). The
  retention text the IDP returns shows up in the consent screen.
- Task 6 is intentionally marked `#skip` — we'll spin it into its own spec when we're ready.

## Open questions for the PM

- Do we want a "remember me" checkbox in v0.1 of this rollout, or is that explicitly v0.2?
  The original Linear ticket said v0.2 but the design mocks show it.
