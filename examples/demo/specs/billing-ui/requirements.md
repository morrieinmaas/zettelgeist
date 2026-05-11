---
depends_on: []
part_of: payments
status: planned
---
# Billing UI

## Why

The in-app billing page is currently a single line: "Email billing@acme.example
to update your plan." We want a self-service page where customers can see their
current plan, usage against limits, next invoice date, and the button to upgrade
or downgrade. This is the most common reason customers email support and the
single highest-friction moment in the lifecycle.

## Acceptance criteria

The system, when a signed-in account owner visits `/settings/billing`:

- [ ] WHEN the page loads
- [ ] THE SYSTEM SHALL display the current plan name, monthly price, and renewal date
- [ ] AND display usage against any metered limits (seats, API calls)
- [ ] AND offer a "Change plan" button that opens the plan-picker drawer
- [ ] AND offer a "Manage payment method" link to Stripe's customer portal

## Out of scope

- The plan-picker drawer behavior itself (will be defined in a follow-up).
- Showing line-item invoice history (Stripe customer portal handles this).
- Non-owner roles (read-only viewers can see the page, can't act).

## References

- design mocks in Figma → "Acme/Settings/Billing" (link redacted in demo)
