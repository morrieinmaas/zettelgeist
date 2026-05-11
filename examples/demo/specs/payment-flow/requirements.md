---
depends_on: [user-auth]
part_of: payments
status: blocked
blocked_by: "Waiting on production Stripe credentials and a signed PSP agreement from finance."
---
# Payment flow

## Why

We currently bill customers via a manual Stripe Dashboard checkout link emailed by
the finance team. This worked for the first 40 customers; it does not scale, and
it adds 24-48h of latency between a prospect committing to a plan and getting
access. The self-serve growth motion needs in-app checkout.

## Acceptance criteria

The system, when a signed-in user starts a checkout:

- [ ] WHEN a user on the pricing page clicks "Buy" on a paid plan
- [ ] THE SYSTEM SHALL create a Stripe Checkout Session with the matching price ID
- [ ] AND redirect to the Stripe-hosted checkout URL
- [ ] AND associate the resulting subscription with the user's account on success
- [ ] AND grant the plan's entitlements within 5 seconds of the webhook arriving

The system, on payment failure:

- [ ] WHEN Stripe returns a `payment_failed` webhook
- [ ] THE SYSTEM SHALL set the subscription state to `past_due`
- [ ] AND email the account owner with a retry link
- [ ] AND continue to allow read-only access for a 7-day grace period

## Out of scope

- Invoicing / NET-30 terms for enterprise (handled manually).
- Tax computation beyond Stripe Tax's defaults.

## References

- Stripe Checkout Session docs
- Internal: finance team's tax-jurisdiction matrix
