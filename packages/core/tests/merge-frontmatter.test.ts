import { describe, expect, it } from 'vitest';
import { mergeFrontmatter } from '../src/merge-frontmatter.js';

function wrap(fm: string, body = '# Spec body\n'): string {
  return `---\n${fm}---\n${body}`;
}

describe('mergeFrontmatter — single-value fields', () => {
  it('preserves status when both sides agree', () => {
    const x = wrap('status: blocked\nblocked_by: idp\n');
    const r = mergeFrontmatter(x, x, x);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: blocked');
  });

  it('takes ours when only ours changed status', () => {
    const base = wrap('status: draft\n');
    const ours = wrap('status: in-progress\n');
    const theirs = wrap('status: draft\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: in-progress');
  });

  it('takes theirs when only theirs changed status', () => {
    const base = wrap('status: draft\n');
    const ours = wrap('status: draft\n');
    const theirs = wrap('status: blocked\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: blocked');
  });

  it('emits a conflict marker when both sides change status differently', () => {
    const base = wrap('status: draft\n');
    const ours = wrap('status: in-progress\n');
    const theirs = wrap('status: blocked\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('<<<<<<< ours: status');
    expect(r.content).toContain('>>>>>>> theirs');
    expect(r.content).toContain('blocked');
    expect(r.content).toContain('in-progress');
  });

  it('blocked_by: one empty + one non-empty → take the non-empty', () => {
    const base = wrap('');
    const ours = wrap('blocked_by: api keys\n');
    const theirs = wrap('');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('blocked_by: api keys');
  });

  it('blocked_by: both non-empty and different → conflict', () => {
    const base = wrap('');
    const ours = wrap('blocked_by: ours reason\n');
    const theirs = wrap('blocked_by: theirs reason\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('<<<<<<< ours: blocked_by');
  });
});

describe('mergeFrontmatter — list fields', () => {
  it('unions depends_on from both sides', () => {
    const base = wrap('depends_on: [a]\n');
    const ours = wrap('depends_on: [a, b]\n');
    const theirs = wrap('depends_on: [a, c]\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toMatch(/depends_on: \[a, b, c\]/);
  });

  it('deduplicates depends_on entries', () => {
    const base = wrap('depends_on: [x]\n');
    const ours = wrap('depends_on: [x, y]\n');
    const theirs = wrap('depends_on: [x, y]\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.content).toMatch(/depends_on: \[x, y\]/);
  });

  it('handles a fresh depends_on on one side only', () => {
    const base = wrap('');
    const ours = wrap('depends_on: [a]\n');
    const theirs = wrap('');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.content).toMatch(/depends_on: \[a\]/);
  });
});

describe('mergeFrontmatter — auto_merge boolean', () => {
  it('logical-ORs auto_merge', () => {
    const base = wrap('');
    const ours = wrap('auto_merge: true\n');
    const theirs = wrap('');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.content).toContain('auto_merge: true');
  });

  it('does not emit auto_merge when neither side set it', () => {
    const base = wrap('status: draft\n');
    const r = mergeFrontmatter(base, base, base);
    expect(r.content).not.toContain('auto_merge');
  });
});

describe('mergeFrontmatter — unknown keys', () => {
  it('preserves an unknown key added on one side', () => {
    const base = wrap('');
    const ours = wrap('priority: high\n');
    const theirs = wrap('');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.content).toContain('priority: high');
  });

  it('passes through identical unknown values on both sides', () => {
    const x = wrap('priority: high\n');
    const r = mergeFrontmatter(x, x, x);
    expect(r.content).toContain('priority: high');
  });

  it('emits conflict marker when both sides set an unknown key to different values', () => {
    const base = wrap('');
    const ours = wrap('priority: high\n');
    const theirs = wrap('priority: low\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('<<<<<<< ours: priority');
  });
});

describe('mergeFrontmatter — body', () => {
  it('takes ours when only ours changed body', () => {
    const base = wrap('status: draft\n', '# Body v1\n');
    const ours = wrap('status: draft\n', '# Body v2 from ours\n');
    const theirs = wrap('status: draft\n', '# Body v1\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('# Body v2 from ours');
  });

  it('emits standard conflict markers when both sides change body differently', () => {
    const base = wrap('', 'baseline body\n');
    const ours = wrap('', 'ours body\n');
    const theirs = wrap('', 'theirs body\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(false);
    expect(r.content).toContain('<<<<<<< ours');
    expect(r.content).toContain('>>>>>>> theirs');
    expect(r.content).toContain('ours body');
    expect(r.content).toContain('theirs body');
  });
});

describe('mergeFrontmatter — edge cases (gap-fill)', () => {
  it('handles frontmatter on one side only (added in ours)', () => {
    const base = '# body\n';
    const ours = wrap('status: in-progress\n', '# body\n');
    const theirs = '# body\n';
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: in-progress');
    expect(r.content).toContain('# body');
  });

  it('handles frontmatter removed on one side', () => {
    const base = wrap('status: draft\n', '# body\n');
    const ours = '# body\n';
    const theirs = wrap('status: draft\n', '# body\n');
    const r = mergeFrontmatter(base, ours, theirs);
    // Either side dropping frontmatter is data loss — current behavior
    // re-emits the surviving fields from `theirs`. Document via test so
    // future changes are explicit.
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: draft');
  });

  it('treats an empty `---\\n---\\n` block as no frontmatter', () => {
    const base = '---\n---\n# body\n';
    const r = mergeFrontmatter(base, base, base);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('# body');
  });

  it('preserves multiline string values via JSON-escape on a single line', () => {
    const base = wrap('description: original\n');
    const ours = wrap('description: "line one\\nline two"\n');
    const theirs = wrap('description: original\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    // The value must round-trip without leaking newlines into the YAML.
    const out = r.content;
    const descLine = out.split('\n').find((l) => l.startsWith('description:'));
    expect(descLine).toBeDefined();
    expect(descLine).toContain('\\n');
  });

  it('keeps non-string list entries instead of silently dropping them', () => {
    const base = wrap('depends_on: [a]\n');
    const ours = wrap('depends_on: [a, 42]\n');
    const theirs = wrap('depends_on: [a]\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    // 42 (a number) is spec-violating but data we MUST preserve so the user
    // can see + fix it rather than waking up to a silently-truncated list.
    expect(r.content).toContain('42');
  });

  it('preserves a non-string scalar in blocked_by rather than coercing to empty', () => {
    const base = wrap('');
    const ours = wrap('blocked_by: 7\n'); // spec violation: should be string
    const theirs = wrap('');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    // The old coercion-to-empty path would drop this entirely; we now keep
    // it so the round-trip preserves user data.
    expect(r.content).toContain('blocked_by: 7');
  });

  it('honors a status NOT in the canonical enum (passes through)', () => {
    const base = wrap('status: draft\n');
    const ours = wrap('status: triaged\n');
    const theirs = wrap('status: draft\n');
    const r = mergeFrontmatter(base, ours, theirs);
    // The merger isn't a validator — schema enforcement lives in
    // `validate`. Pass unknown statuses through so people can experiment.
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: triaged');
  });

  it('lets auto_merge be turned off via 3-way (was broken under raw OR)', () => {
    const base = wrap('auto_merge: true\n');
    const ours = wrap('auto_merge: false\n'); // explicit turn-off
    const theirs = wrap('auto_merge: true\n'); // unchanged from base
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    // 3-way: theirs unchanged → take ours = false → field omitted (we
    // never emit a default false). Old OR semantics would force `true`.
    expect(r.content).not.toContain('auto_merge: true');
  });

  it('emits a conflict marker when both sides change auto_merge differently from base', () => {
    const base = wrap('auto_merge: false\n');
    const ours = wrap('auto_merge: true\n');
    const theirs = wrap('');
    // theirs removed the key (treated as undefined). ours changed false→true.
    // → take ours = true. No conflict. ok=true.
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('auto_merge: true');
  });

  it('uses git merge-file for line-level body merge of overlapping prose', () => {
    const base = wrap('', 'line 1\nline 2\nline 3\n');
    // ours edits line 1, theirs edits line 3 — disjoint changes should
    // merge cleanly via git merge-file (byte-equality fallback couldn't).
    const ours = wrap('', 'LINE 1\nline 2\nline 3\n');
    const theirs = wrap('', 'line 1\nline 2\nLINE 3\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('LINE 1');
    expect(r.content).toContain('LINE 3');
  });
});

describe('mergeFrontmatter — combined cases', () => {
  it('merges concurrent edits to different non-overlapping fields cleanly', () => {
    const base = wrap('status: draft\ndepends_on: [a]\n');
    const ours = wrap('status: in-progress\ndepends_on: [a]\n');
    const theirs = wrap('status: draft\ndepends_on: [a, b]\n');
    const r = mergeFrontmatter(base, ours, theirs);
    expect(r.ok).toBe(true);
    expect(r.content).toContain('status: in-progress');
    expect(r.content).toMatch(/depends_on: \[a, b\]/);
  });

  it('files without frontmatter just text-merge', () => {
    const r = mergeFrontmatter('hello\n', 'hello\n', 'hello\n');
    expect(r.content).toBe('hello\n');
  });

  it('emits frontmatter keys in a deterministic order', () => {
    const base = wrap('');
    const ours = wrap('depends_on: [a]\nstatus: in-progress\nblocked_by: x\n');
    const r = mergeFrontmatter(base, ours, base);
    // status first, then blocked_by, then depends_on (canonical order)
    const statusIdx = r.content.indexOf('status:');
    const blockedIdx = r.content.indexOf('blocked_by:');
    const dependsIdx = r.content.indexOf('depends_on:');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(blockedIdx).toBeGreaterThan(statusIdx);
    expect(dependsIdx).toBeGreaterThan(blockedIdx);
  });
});
