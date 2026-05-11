# Tasks

- [x] 1. Pick the integration surface (Checkout Sessions vs Payment Element)
- [x] 2. Scaffold the `@acme/billing` package with the Stripe SDK
- [x] 3. Implement `createCheckoutSession` + the `/api/checkout` route
- [ ] 4. Wire the Stripe webhook handler for `checkout.session.completed`
- [ ] 5. Wire the `invoice.payment_failed` handler + email
- [ ] 6. End-to-end test with the Stripe CLI's `trigger` command #human-only
