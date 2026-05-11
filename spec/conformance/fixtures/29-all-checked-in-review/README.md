# 29-all-checked-in-review — every counted task checked → `in-review`

When `allChecked && !merged`, status is `in-review`. The conformance
harness never populates `mergedSpecs`, so this fixture lands in
`in-review` and not `done`. The transition to `done` happens once the
branch is merged into the default branch (tracked outside the spec
files).
