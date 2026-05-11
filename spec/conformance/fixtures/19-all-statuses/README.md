# 19-all-statuses — explicit `status:` override accepts every valid value

The seven valid statuses are `draft`, `planned`, `in-progress`, `in-review`,
`done`, `blocked`, `cancelled`. When `frontmatter.status` is one of these,
it overrides derivation. This fixture pins every value down so a refactor
can't silently lose one.
