---
depends_on: []
part_of: integrations
replaces: email-notifications
branch: feat/webhooks
worktree: ../zg-webhooks
---
# Outbound webhooks

## Why

Customers want a structured event stream they can route into their own
infrastructure: Slack channels, PagerDuty incidents, internal databases,
data-warehouse pipelines. This is what they asked for when we scoped
`email-notifications`; we cancelled that spec and replaced it with this one.

Webhooks are also a frequent line item in mid-market enterprise security
reviews ("does the platform offer a programmatic audit feed"), so the
adjacent revenue impact is real.

## Acceptance criteria

The system, when a registered event occurs:

- [ ] WHEN any event in the configured event taxonomy fires
- [ ] THE SYSTEM SHALL POST a signed JSON payload to each subscribed endpoint
- [ ] AND retry with exponential backoff for 24 hours on non-2xx responses
- [ ] AND record every attempt (success or failure) in a per-account delivery log

The system, for endpoint security:

- [ ] WHEN an endpoint is registered
- [ ] THE SYSTEM SHALL generate a per-endpoint signing secret
- [ ] AND sign each delivery's body with HMAC-SHA256
- [ ] AND include the signature in the `X-Acme-Signature` header

## Out of scope

- Inbound webhooks ("Receive into Acme from third party").
- A drag-and-drop event-routing UI (a separate spec when the bare API is proven).

## References

- `email-notifications` — the cancelled predecessor.
- Stripe's webhook signing pattern is our reference design.
