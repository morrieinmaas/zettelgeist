# 40-yaml-folded-blocked-by — YAML `>` folded scalar collapses to one line

YAML's folded block scalar (`>`) replaces newlines with single spaces
within a value. INDEX rendering trims the trailing newline. This pins
down that multi-line frontmatter values are surfaced as a single line in
the rendered table — important because a row break inside a cell would
silently break the markdown table.
