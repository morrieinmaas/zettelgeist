# 43-per-actor-claim — multiple `.claim-<actor>` files coexist; status derives to `in-progress`

A spec with **two** `.claim-*` files (`alice`, `bob`) is treated as claimed.
With no counted tasks and no explicit status override, the derived status is
`in-progress` (the "claimed but no tasks" branch of `deriveStatus`).

This pins down two things:

- Per-actor claim files are recognised by the loader, not just `.claim`
- Multiple coexisting claims on the same spec is the normal case (the whole
  point of the per-actor naming is to avoid merge conflicts when two
  machines claim concurrently)
