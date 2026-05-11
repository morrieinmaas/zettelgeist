# 13-numeric-name — digits and dashes are valid in spec names

The regex `[a-z0-9-]+` permits names that start with or contain digits.
`2024-audit` loads cleanly, contributes a graph node, and derives status
normally. Pinned down so a future "must start with a letter" tightening
of the regex would be a deliberate breaking change.
