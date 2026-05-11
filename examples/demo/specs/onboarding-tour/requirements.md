---
depends_on: [user-auth]
part_of: growth
---
# First-run onboarding tour

## Why

Self-serve activation is currently 34% within 7 days of sign-up — well below
the 50% benchmark we set in our growth OKR. Internal interviews suggest the
top blocker isn't motivation but discoverability: new users don't know what
the product can do, so they try one thing, find it works, and never log back
in. A guided tour on first sign-in should lift activation by surfacing the
three highest-value flows in the first 60 seconds.

## Acceptance criteria

The system, when a user signs in for the first time:

- [ ] WHEN a freshly-created account's user signs in
- [ ] THE SYSTEM SHALL display a multi-step product tour overlay on the main app shell
- [ ] AND highlight three key surfaces: "Create your first project", "Invite a teammate", "Connect a data source"
- [ ] AND track each step's completion and skip-rate in the product analytics stream
- [ ] AND allow the user to dismiss the tour at any step

The system, on subsequent sign-ins:

- [ ] WHEN a user who has previously completed or dismissed the tour signs in
- [ ] THE SYSTEM SHALL NOT show the tour again
- [ ] AND SHALL surface a "Show me around" link in the help menu instead

## Out of scope

- Role-specific tours (admin vs. member).
- A/B testing the copy (separate ticket once the tour ships).

## References

- internal: growth OKR doc Q2-2026
- product analytics event spec → `tour_step_viewed`, `tour_step_completed`, `tour_dismissed`
