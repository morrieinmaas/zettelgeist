# 44-legacy-single-claim — v0.1 `.claim` file still recognised on read

A spec carrying a legacy single `.claim` file (the v0.1 shape, before
per-actor `.claim-<id>` was introduced in v0.2) is still treated as
claimed. Status derives to `in-progress` because the spec has no tasks
and the `.claim` is present.

This pins down back-compat: existing repos do not need a one-shot
migration to keep working with v0.2+ tooling.
