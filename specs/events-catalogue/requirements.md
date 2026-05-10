---
depends_on: []
part_of: v0.2-format
---
# Events catalogue

## Why

Plan 1 §events listed roughly ten events (`spec.created`, `spec.started`, `spec.task.completed`, `spec.completed`, `spec.blocked`, `spec.unblocked`, `spec.dependency.added`, `spec.dependency.removed`, `spec.cancelled`, `spec.archived`) with planned delivery via webhooks and an MCP event-stream capability. v0.1 froze the file format only; integrators need pinned payload shapes before they can build agents that react to state changes. This spec pins those shapes for v0.2 of the format.

## Acceptance criteria

The system, for each event in the catalogue:

- WHEN the event is emitted
- THE SYSTEM SHALL produce a payload that matches the published JSON schema for that event
- AND include common fields: `event_type`, `spec_id`, `timestamp`, `actor`, `format_version`

The system, on a state transition:

- WHEN a spec's status changes (computed from frontmatter + tasks)
- THE SYSTEM SHALL emit exactly one `spec.<new-status>` event
- AND emit a `spec.task.completed` event for each task whose checkbox flipped from `[ ]` to `[x]`

The system, in conformance:

- WHEN the conformance harness runs
- THE SYSTEM SHALL exercise each event type against a fixture
- AND assert the emitted payload against the schema

The system, on the MCP server:

- WHEN a client requests the optional events capability
- THE SYSTEM SHALL stream events over an `events.stream` long-poll or SSE endpoint
- AND the schema is the same as the webhook schema

## Out of scope

- Webhook retry policy and signing (a delivery spec, separate).
- The `auto_merge: true` automation that consumes these events (separate).

## References

- [docs/design.md](../../docs/design.md) — §"events: webhooks + MCP"
- [packages/core/src/](../../packages/core/src/) — status computation we'd hook into
