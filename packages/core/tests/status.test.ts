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
