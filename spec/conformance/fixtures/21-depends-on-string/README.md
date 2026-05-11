# 21-depends-on-string — non-array `depends_on` is ignored, no edge produced

`buildGraph` requires `depends_on` to be an array of strings. A scalar
string (or any other shape) is silently discarded rather than treated as
a one-element array. This fixture pins that down so an "auto-promote"
refactor would be caught.
