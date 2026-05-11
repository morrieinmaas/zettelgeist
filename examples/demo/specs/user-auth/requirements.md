---
depends_on: []
part_of: identity
pr: https://github.com/acme/example/pull/142
branch: feat/user-auth
---
# User authentication

## Why

Acme's customers need to sign in to access their billing dashboards and account settings. The current surface is a hand-rolled session-cookie system from the v1 launch; it doesn't support SSO (a top-3 enterprise blocker in our last three lost deals), and we have a known CSRF exposure that's been on the security backlog for two quarters.

## Acceptance criteria

The system, when a user signs in:

- WHEN a user submits credentials via the login form
- THE SYSTEM SHALL authenticate against the configured identity provider (local credentials, SAML 2.0, or OIDC)
- AND issue a session token compatible with the existing cookie-based session storage
- AND CSRF-protect all subsequent state-changing requests

The system, when a user signs out:

- WHEN a user clicks "sign out"
- THE SYSTEM SHALL invalidate the session token server-side
- AND clear the session cookie client-side

## Out of scope

- WebAuthn / passkeys (tracked separately).
- Migration of existing v1 sessions; sessions will be force-expired at cutover.

## References

- [docs/architecture.md](../../../../docs/architecture.md) — host-agnostic surfaces overview
