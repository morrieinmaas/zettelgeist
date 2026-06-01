import { describe, expect, it } from 'vitest';
import { deriveStatus } from '../src/status.js';
import type { RepoState, Spec } from '../src/types.js';

const emptyRepoState: RepoState = {
  claimedSpecs: new Set(),
  mergedSpecs: new Set(),
};

function spec(overrides: Partial<Spec>): Spec {
  return {
    name: 'foo',
    frontmatter: {},
    requirements: null,
    tasks: [],
    handoff: null,
    lenses: new Map(),
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('returns "cancelled" when frontmatter overrides', () => {
    expect(
      deriveStatus(spec({ frontmatter: { status: 'cancelled' } }), emptyRepoState),
    ).toBe('cancelled');
  });

  it('returns "blocked" when frontmatter overrides', () => {
    expect(
      deriveStatus(spec({ frontmatter: { status: 'blocked' } }), emptyRepoState),
    ).toBe('blocked');
  });

  it('honors frontmatter override for all statuses (board drag-to-column writes any of the 7)', () => {
    for (const s of ['draft', 'planned', 'in-progress', 'in-review', 'done'] as const) {
      // Spec has 2 unticked tasks → derived would say "planned"
      expect(
        deriveStatus(
          spec({
            frontmatter: { status: s },
            tasks: [
              { index: 1, checked: false, text: 'a', tags: [] },
              { index: 2, checked: false, text: 'b', tags: [] },
            ],
          }),
          emptyRepoState,
        ),
      ).toBe(s);
    }
  });

  it('ignores garbage frontmatter status and falls back to derived', () => {
    // Cast: in the wild, frontmatter is parsed YAML — anything can show up
    expect(
      deriveStatus(
        spec({ frontmatter: { status: 'not-a-status' as unknown as never } }),
        emptyRepoState,
      ),
    ).toBe('draft');
  });

  it('"cancelled" wins over "blocked" if both are set (cancelled is checked first)', () => {
    // The schema only allows one of the two, but defensively the priority is documented.
    expect(
      deriveStatus(spec({ frontmatter: { status: 'cancelled' } }), emptyRepoState),
    ).toBe('cancelled');
  });

  it('returns "draft" when there is no tasks.md content (no tasks)', () => {
    expect(deriveStatus(spec({}), emptyRepoState)).toBe('draft');
  });

  it('returns "planned" when tasks exist and none are checked', () => {
    expect(
      deriveStatus(
        spec({
          tasks: [
            { index: 1, checked: false, text: 'a', tags: [] },
            { index: 2, checked: false, text: 'b', tags: [] },
          ],
        }),
        emptyRepoState,
      ),
    ).toBe('planned');
  });

  it('returns "in-progress" when some but not all tasks are checked', () => {
    expect(
      deriveStatus(
        spec({
          tasks: [
            { index: 1, checked: true, text: 'a', tags: [] },
            { index: 2, checked: false, text: 'b', tags: [] },
          ],
        }),
        emptyRepoState,
      ),
    ).toBe('in-progress');
  });

  it('returns "in-progress" when a claim is held even with no ticked tasks', () => {
    expect(
      deriveStatus(spec({ name: 'foo', tasks: [] }), {
        claimedSpecs: new Set(['foo']),
        mergedSpecs: new Set(),
      }),
    ).toBe('in-progress');
  });

  it('skips #skip tasks when judging completeness', () => {
    expect(
      deriveStatus(
        spec({
          tasks: [
            { index: 1, checked: true, text: 'a', tags: [] },
            { index: 2, checked: false, text: 'maybe', tags: ['#skip'] },
          ],
        }),
        emptyRepoState,
      ),
    ).toBe('in-review');
  });

  it('returns "in-review" when all non-#skip tasks ticked and not merged', () => {
    expect(
      deriveStatus(
        spec({
          tasks: [{ index: 1, checked: true, text: 'a', tags: [] }],
        }),
        emptyRepoState,
      ),
    ).toBe('in-review');
  });

  it('self-heals a `status: draft` override when every counted task is checked (unmerged)', () => {
    // The board's "+" button pins `status: draft` so new cards appear in
    // the draft column. Without a self-heal, the override beats the
    // derived status forever — even after the user ticks every task.
    expect(
      deriveStatus(
        spec({
          frontmatter: { status: 'draft' },
          tasks: [
            { index: 1, checked: true, text: 'a', tags: [] },
            { index: 2, checked: true, text: 'b', tags: [] },
          ],
        }),
        emptyRepoState,
      ),
    ).toBe('in-review');
  });

  it('self-healed draft override goes to "done" when also merged', () => {
    expect(
      deriveStatus(
        spec({
          name: 'foo',
          frontmatter: { status: 'draft' },
          tasks: [{ index: 1, checked: true, text: 'a', tags: [] }],
        }),
        { claimedSpecs: new Set(), mergedSpecs: new Set(['foo']) },
      ),
    ).toBe('done');
  });

  it('respects a `status: draft` override when only SOME tasks are checked', () => {
    // Partial progress might be deliberate ("I want to rethink this; keep
    // it on the draft column"), so we only self-heal at all-done.
    expect(
      deriveStatus(
        spec({
          frontmatter: { status: 'draft' },
          tasks: [
            { index: 1, checked: true, text: 'a', tags: [] },
            { index: 2, checked: false, text: 'b', tags: [] },
          ],
        }),
        emptyRepoState,
      ),
    ).toBe('draft');
  });

  it('respects a `status: draft` override when there are no counted tasks', () => {
    // Matches conformance fixture 19-all-statuses/a-draft: status:draft
    // override on a spec with no tasks at all stays "draft".
    expect(
      deriveStatus(spec({ frontmatter: { status: 'draft' } }), emptyRepoState),
    ).toBe('draft');
  });

  it('does NOT self-heal other override values even when all tasks are checked', () => {
    // The self-heal is narrowly for `draft` — other overrides may reflect
    // intentional user state and must not be silently re-derived.
    for (const s of ['planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled'] as const) {
      expect(
        deriveStatus(
          spec({
            frontmatter: { status: s },
            tasks: [{ index: 1, checked: true, text: 'a', tags: [] }],
          }),
          emptyRepoState,
        ),
      ).toBe(s);
    }
  });

  it('returns "done" when all non-#skip tasks ticked and merged', () => {
    expect(
      deriveStatus(
        spec({
          name: 'foo',
          tasks: [{ index: 1, checked: true, text: 'a', tags: [] }],
        }),
        { claimedSpecs: new Set(), mergedSpecs: new Set(['foo']) },
      ),
    ).toBe('done');
  });
});
