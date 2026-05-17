import { describe, expect, it } from 'vitest';
import { mergeTasksMd } from '../src/merge-tasks.js';

const SAME = `- [ ] one
- [ ] two
- [ ] three
`;

describe('mergeTasksMd — per-task check state', () => {
  it('returns the base when no side changed anything', () => {
    const r = mergeTasksMd(SAME, SAME, SAME);
    expect(r.ok).toBe(true);
    // Ours is the structural template; output should be byte-equal-ish (minus the trailing newline normalization).
    expect(r.content.replace(/\s+$/, '')).toBe(SAME.replace(/\s+$/, ''));
  });

  it('takes ours when only ours changed a check', () => {
    const ours = '- [x] one\n- [ ] two\n- [ ] three\n';
    const r = mergeTasksMd(SAME, ours, SAME);
    expect(r.content).toContain('- [x] one');
    expect(r.content).toContain('- [ ] two');
  });

  it('takes theirs when only theirs changed a check', () => {
    const theirs = '- [ ] one\n- [x] two\n- [ ] three\n';
    const r = mergeTasksMd(SAME, SAME, theirs);
    expect(r.content).toContain('- [x] two');
  });

  it('merges concurrent checks of DIFFERENT tasks (no conflict)', () => {
    const ours = '- [x] one\n- [ ] two\n- [ ] three\n';
    const theirs = '- [ ] one\n- [ ] two\n- [x] three\n';
    const r = mergeTasksMd(SAME, ours, theirs);
    expect(r.content).toContain('- [x] one');
    expect(r.content).toContain('- [x] three');
    expect(r.content).not.toContain('<<<<<<<');
  });

  it('either-side-checked wins when both sides tick THE SAME task', () => {
    const ours = '- [x] one\n- [ ] two\n- [ ] three\n';
    const theirs = '- [x] one\n- [ ] two\n- [ ] three\n';
    const r = mergeTasksMd(SAME, ours, theirs);
    expect(r.content.match(/- \[x\] one/g)).toHaveLength(1);
  });

  it('both sides un-tick from a checked base → un-checked', () => {
    const base = '- [x] one\n- [ ] two\n';
    const ours = '- [ ] one\n- [ ] two\n';
    const theirs = '- [ ] one\n- [ ] two\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('- [ ] one');
    expect(r.content).not.toContain('- [x] one');
  });

  it('one side un-ticks, the other leaves checked → stays checked (tick wins)', () => {
    const base = '- [x] one\n- [ ] two\n';
    const ours = '- [ ] one\n- [ ] two\n';
    const theirs = '- [x] one\n- [ ] two\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('- [x] one');
  });
});

describe('mergeTasksMd — additions and removals', () => {
  it('appends tasks added in theirs that ours does not have', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one\n';
    const theirs = '- [ ] one\n- [ ] two-from-theirs\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('- [ ] one');
    expect(r.content).toContain('- [ ] two-from-theirs');
  });

  it('keeps tasks added in ours regardless of theirs', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one\n- [ ] two-from-ours\n';
    const theirs = '- [ ] one\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('- [ ] two-from-ours');
  });

  it('preserves both sides additions in a single output (no duplicates)', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one\n- [ ] two-from-ours\n';
    const theirs = '- [ ] one\n- [ ] three-from-theirs\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('- [ ] two-from-ours');
    expect(r.content).toContain('- [ ] three-from-theirs');
    // Each text appears once
    expect(r.content.match(/two-from-ours/g)).toHaveLength(1);
    expect(r.content.match(/three-from-theirs/g)).toHaveLength(1);
  });

  it('renamed task appears as both versions (delete-and-add semantics)', () => {
    const base = '- [ ] old name\n';
    const ours = '- [ ] new name from ours\n';
    const theirs = '- [ ] old name\n';
    const r = mergeTasksMd(base, ours, theirs);
    // ours version preserved
    expect(r.content).toContain('new name from ours');
    // theirs (unchanged) version also preserved — that's the "rename looks like rename+keep" trade-off
    expect(r.content).toContain('old name');
  });
});

describe('mergeTasksMd — tags', () => {
  it('takes the union of tags when one side adds a tag', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one #human-only\n';
    const theirs = '- [ ] one\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('#human-only');
  });

  it('unions tags from both sides', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one #human-only\n';
    const theirs = '- [ ] one #agent-only\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('#human-only');
    expect(r.content).toContain('#agent-only');
  });

  it('does not duplicate a tag both sides added', () => {
    const base = '- [ ] one\n';
    const ours = '- [ ] one #skip\n';
    const theirs = '- [ ] one #skip\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content.match(/#skip/g)).toHaveLength(1);
  });
});

describe('mergeTasksMd — prose preservation', () => {
  it('preserves headings and blank lines from ours', () => {
    const base = '# Tasks\n\n## Phase 1\n\n- [ ] one\n\n## Phase 2\n\n- [ ] two\n';
    const ours = '# Tasks\n\n## Phase 1\n\n- [x] one\n\n## Phase 2\n\n- [ ] two\n';
    const theirs = '# Tasks\n\n## Phase 1\n\n- [ ] one\n\n## Phase 2\n\n- [x] two\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).toContain('# Tasks');
    expect(r.content).toContain('## Phase 1');
    expect(r.content).toContain('## Phase 2');
    expect(r.content).toContain('- [x] one');
    expect(r.content).toContain('- [x] two');
  });

  it('does not introduce conflict markers even with multiple concurrent ticks', () => {
    const base = '- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n';
    const ours = '- [x] a\n- [ ] b\n- [x] c\n- [ ] d\n';
    const theirs = '- [ ] a\n- [x] b\n- [ ] c\n- [x] d\n';
    const r = mergeTasksMd(base, ours, theirs);
    expect(r.content).not.toContain('<<<<<<<');
    expect(r.content).not.toContain('=======');
    expect(r.content).toContain('- [x] a');
    expect(r.content).toContain('- [x] b');
    expect(r.content).toContain('- [x] c');
    expect(r.content).toContain('- [x] d');
  });
});

describe('mergeTasksMd — edge cases', () => {
  it('handles empty files', () => {
    const r = mergeTasksMd('', '', '');
    expect(r.ok).toBe(true);
    expect(r.content).toBe('');
  });

  it('handles empty base with additions on both sides', () => {
    const ours = '- [ ] a\n';
    const theirs = '- [ ] b\n';
    const r = mergeTasksMd('', ours, theirs);
    expect(r.content).toContain('- [ ] a');
    expect(r.content).toContain('- [ ] b');
  });

  it('strips numeric prefixes consistent with parseTasks', () => {
    const ours = '- [ ] 1. do thing\n';
    const theirs = '- [x] 1. do thing\n';
    const r = mergeTasksMd(ours, ours, theirs);
    // Either-side-checked → checked; text is the parsed (de-numbered) form
    expect(r.content).toContain('- [x] do thing');
  });
});
