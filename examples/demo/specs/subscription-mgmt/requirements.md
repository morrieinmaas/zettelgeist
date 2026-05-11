---
depends_on: [user-auth, payment-flow]
part_of: payments
---
# Subscription lifecycle management

## Why

Once payment-flow lands, we still need the API and the back-office tools to
manage the resulting subscriptions over time: pause, resume, upgrade mid-cycle
with proration, cancel at period end, and force-cancel for fraud. The Stripe
Dashboard covers most of this, but support engineers need to do it without
direct Stripe access (PCI scope reduction).

## Acceptance criteria

The system, for any authenticated support engineer:

- WHEN a support engineer issues `POST /admin/subscriptions/:id/cancel`
- THE SYSTEM SHALL cancel the subscription in Stripe via the SDK
- AND set the local subscription state to `cancelled`
- AND emit an audit log entry tagging the actor and the reason
- AND keep entitlements active until the current period end

The system, on plan upgrades:

- WHEN a user upgrades their plan mid-cycle
- THE SYSTEM SHALL prorate the difference using Stripe's default proration logic
- AND grant the new plan's entitlements immediately

## Out of scope

- Discount codes / coupons (manual via Stripe Dashboard for now).
- Annual billing toggles (separate spec).

## References

- Stripe Subscriptions API
- internal: SOC 2 audit-log requirements
