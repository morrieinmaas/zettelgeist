---
depends_on: [user-auth]
part_of: identity
---

# OAuth provider integrations

## Why

Once SSO is live (see `user-auth`), the next ask from prospective customers is the
consumer-grade "Continue with Google / Microsoft / Apple" buttons. These are not
enterprise SSO — they're for individual signups on the self-serve tier. Sales has
flagged this as the most common request in self-serve onboarding feedback.

## Acceptance criteria

The system, when a user starts an OAuth sign-in:

- WHEN a user clicks "Continue with $PROVIDER" on the sign-in or sign-up page
- THE SYSTEM SHALL redirect to the provider's OAuth authorize endpoint
- AND include the configured scopes (`email`, `profile`)
- AND validate the returned ID token's signature and issuer
- AND create or link a local user record keyed by the verified email

The system, on first sign-in via OAuth:

- WHEN the verified email matches an existing local account
- THE SYSTEM SHALL link the OAuth identity to the existing account
- AND require the user to enter their existing password once to confirm the link

## Out of scope

- GitHub / GitLab / Bitbucket — niche for our buyer profile, tracked separately.
- Letting users sign in with multiple OAuth providers on the same account (v0.2+).

## References

- [packages/auth/oauth/](#) — package this lands in
