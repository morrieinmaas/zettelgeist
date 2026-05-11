# Handoff — webhooks — 2026-05-05

## What was done this session

- Locked in the event taxonomy (task 1). v1 ships with 14 event types across
  three namespaces: `billing.*`, `membership.*`, `data.*`. Documented in
  `packages/webhooks/EVENTS.md`.
- Dispatcher worker is up (task 2). Uses `pg-boss` for the queue, retries
  at 30s / 2m / 10m / 1h / 6h / 24h then dead-letter. Tested by killing the
  worker mid-batch — nothing was lost on restart.
- HMAC signing is in place (task 3). Header format matches Stripe's
  `t=<timestamp>,v1=<sig>` style so customers who already verify Stripe
  webhooks have a familiar pattern.

## Open work

- Task 4: the endpoint-management UI. UX is sketched in Figma; eng can pick
  this up as soon as billing-ui's design system tokens are stable
  (there's a soft dep we don't formalize because billing-ui hasn't started yet).
- Task 5: the delivery-log UI. Backend already records every attempt; the UI
  is a list + filter view, should take a day.
- Task 6 is `#human-only` because the docs need a real human's voice and an
  approved screencast of the registration flow.

## Notes

- The "soft dep" on billing-ui is intentionally not in `depends_on`. Both
  specs reference the same design tokens, but neither blocks the other's
  functional acceptance criteria. Listing it as a hard dep would mislead
  the graph view.
