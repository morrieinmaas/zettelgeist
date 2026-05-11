# Business lens — onboarding-tour

## The metric we're moving

7-day activation rate. Today: 34%. Target after this ships: 45%. Stretch: 50%.

"Activated" means: completed at least one of the three highlighted flows
(created a project, invited a teammate, OR connected a data source).

## Why this and not paid acquisition

We can buy more sign-ups at the top of the funnel, but our paid CAC has crept
up 18% YoY and the LTV:CAC ratio is now 2.4:1 — at the edge of healthy. The
single highest-leverage thing we can do for the unit economics this quarter is
convert more of the sign-ups we already have, not buy more of them.

## Risk: tour fatigue

There is a known pattern where users develop "tour blindness" and reflexively
dismiss anything that looks like a coachmark. Mitigations:

- Tour appears once. Period.
- We track `tour_dismissed_at_step_0` as a leading indicator. If that rate
  exceeds 40%, we re-evaluate.

## Revenue impact (rough)

If we hit 45% activation, that's ~250 additional activated users per quarter
at our current top-of-funnel rate. At our self-serve plan ARPU (~$28/mo), that's
roughly $84K of new ARR per quarter. Estimate is +/- 30%, but the order of
magnitude justifies the engineering cost.
