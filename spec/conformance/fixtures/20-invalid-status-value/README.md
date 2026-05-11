# 20-invalid-status-value — unknown status string falls through to derivation

Only the 7 documented values count as an override. Anything else is
ignored silently and the spec falls back to derived status (here: `draft`).
