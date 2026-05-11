---
depends_on: []
part_of: growth
status: cancelled
blocked_by: "Superseded by `webhooks`. Customers consistently asked for a structured event stream they could route themselves rather than another email firehose. See the `webhooks` spec for the replacement."
---
# Email notifications (cancelled)

## Why (historical)

The original premise was that customers wanted near-real-time email when
specific events happened in their account: a teammate completed a task, an
invoice failed, a data source disconnected. We scoped a templating system,
unsubscribe management, and a delivery worker.

## What changed

In the discovery interviews for this spec, every customer who'd previously
asked for email notifications, when shown a side-by-side mock of "we email
you" vs "we POST to your endpoint when this happens," picked the webhook.
Reasons varied — most wanted to route into Slack, PagerDuty, or their own
internal tooling, not into more inboxes.

We cancelled this spec and started `webhooks` instead. `webhooks` declares
`replaces: email-notifications` in its frontmatter so surfaces can redirect
links here to there.

## What survived

- The notification taxonomy ("billing", "membership", "data") carries over
  into the webhook event-type namespace.
- The user-level subscription model carries over: users opt into specific
  event categories, not every event.

## References

- `webhooks` — the replacement.
- Discovery interview notes in `notion/customer-research/2026-Q1`.
