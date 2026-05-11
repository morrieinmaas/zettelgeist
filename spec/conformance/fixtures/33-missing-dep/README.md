# 33-missing-dep — dependencies on nonexistent specs are silently dropped

`buildGraph` filters out edges whose target isn't in the loaded spec set.
There is currently no validation error for this — pinning that down here
so a future "strict mode" change is a deliberate decision.
