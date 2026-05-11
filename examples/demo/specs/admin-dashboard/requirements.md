---
depends_on: [user-auth, billing-ui]
part_of: internal
---
# Internal admin dashboard

## Why

Support, finance, and the on-call SRE all currently SSH into production to
answer customer questions. This is bad for SOC 2 (privileged access scope),
bad for response time (90s of "wait, what was the right query again"), and
bad for the people doing it (toil). An internal admin dashboard with the
top-10 read-only queries plus a small set of audited mutations is the goal.

## Acceptance criteria

The system, for any authenticated staff account:

- WHEN a staff user visits `/admin`
- THE SYSTEM SHALL display a search box keyed on account ID, email, or org slug
- AND surface, for the selected account: plan, MRR, last sign-in, support ticket count
- AND offer the top-5 read-only "I need to debug this" queries as one-click actions
- AND offer the top-3 audited mutations (force-resend-invoice, reset-password-link, suspend-account) gated behind a confirmation modal

The system, for audit:

- WHEN any mutation runs from `/admin`
- THE SYSTEM SHALL record the actor, the target, the action, and a free-text reason
- AND retain the audit log for at least 7 years

## Out of scope

- A general-purpose query builder (read-only IDs and saved queries only).
- An "as user" impersonation feature (separate spec; legal needs to weigh in).

## References

- SOC 2 control CC6.3 — privileged access management
- support team's "things we SSH for" list (~30 items, top 10 chosen)
