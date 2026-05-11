# Tech lens — onboarding-tour

## Library choice

Shepherd.js v14. Considered alternatives:

- **Driver.js** — smaller bundle, but no built-in keyboard-nav or aria handling.
- **Intro.js** — non-MIT license; legal said no.
- **Roll our own** — discussed for 20 minutes. Saved the time; not strategic.

## Bundle impact

Shepherd is 23KB gzipped. We code-split it into a separate chunk that only
loads when the "first sign-in?" check returns true, so the main bundle is
unaffected for the >99% of sign-ins that are returning users.

## "First sign-in?" detection

A single boolean column `users.onboarding_completed_at TIMESTAMP NULL`. The
app shell does one extra `SELECT` on sign-in; if NULL, lazy-load the tour and
show it. On `tour_dismissed` or `tour_completed`, we `UPDATE` it to `NOW()`.
Using NULL-vs-set rather than a boolean lets us later compute
"days from sign-up to first tour event" without schema changes.

## Analytics wiring

Events go through the existing `analytics.track(eventName, props)` client,
which fans out to Segment. Per existing convention:

```ts
analytics.track('tour_step_viewed', { step_index, step_id });
analytics.track('tour_step_completed', { step_index, step_id, elapsed_ms });
analytics.track('tour_dismissed', { last_step_index, elapsed_ms });
```

## Test coverage

- Component-level tests with React Testing Library for the step state machine.
- A single Playwright E2E that signs in as a fresh user, walks the tour, and
  asserts the `onboarding_completed_at` column updates.
