# Design lens — onboarding-tour

## Tour mechanics

We use a "spotlight" pattern: the highlighted element keeps its normal styling,
and everything else dims to 60% opacity behind a dark overlay. This is more
forgiving than a tooltip-only approach: even if our coachmark anchor is slightly
off (responsive layouts, late-loading content), the user still sees what we
mean to point at.

## Copy

Each step has three lines max:

1. The action verb ("Create your first project")
2. One sentence of why it matters
3. A "Got it" primary button and a "Skip tour" tertiary link

We tested longer copy in user interviews; users skimmed past it. Short copy
gets read.

## Dismissibility

The tour is fully dismissible at every step. We do not lock the user into
finishing it. The "x" close button in the top-right of every coachmark is the
universal exit. If the user closes mid-tour, we count that as `tour_dismissed`
with the step index, not as `tour_step_completed`.

## Accessibility

Coachmarks are real DOM elements with `role="dialog"` and `aria-labelledby`
pointing at the step heading. Keyboard navigation: `Tab` cycles inside the
coachmark; `Esc` dismisses; `Enter` advances. The spotlight overlay does not
trap focus — we want screen-reader users to navigate freely if they prefer.
