# 18-unknown-keys — unrecognised frontmatter keys are preserved silently

The spec allows arbitrary user-defined keys (`priority`, `owner`, etc.).
They do not affect status derivation, the graph, or validation. Tools
should round-trip them on save.
