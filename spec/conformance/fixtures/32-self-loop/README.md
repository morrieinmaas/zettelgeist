# 32-self-loop — `depends_on: [self]` is a 1-element cycle

A spec that depends on itself produces a single edge `narcissus → narcissus`
and a single-node cycle. Validation emits one E_CYCLE.
