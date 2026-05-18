import { describe, expect, it } from 'vitest';
import {
  parseLogCycles,
  serializeLog,
  rotateLog,
  appendClaim,
  appendAction,
  appendRelease,
  DEFAULT_MAX_CYCLES,
} from '../src/log.js';

function joinLines(...lines: string[]): string {
  return lines.join('\n');
}

describe('parseLogCycles', () => {
  it('parses a single complete cycle', () => {
    const input = joinLines(
      '## ⊢ 2026-05-18T11:30:00Z · agent=morrie · claim',
      '- 2026-05-18T11:31:00Z · agent=morrie · tick_task(2)',
      '## ⊣ 2026-05-18T11:42:00Z · agent=morrie · release · sha=abc1234',
    );
    const r = parseLogCycles(input);
    expect(r.cycles).toHaveLength(1);
    const cycle = r.cycles[0]!;
    expect(cycle.open.agentId).toBe('morrie');
    expect(cycle.open.timestamp).toBe('2026-05-18T11:30:00Z');
    expect(cycle.close?.sha).toBe('abc1234');
    expect(cycle.entries).toHaveLength(1);
    expect(cycle.entries[0]).toMatchObject({
      kind: 'action',
      action: 'tick_task(2)',
      agentId: 'morrie',
    });
  });

  it('parses multiple cycles in order', () => {
    const input = joinLines(
      '## ⊢ T1 · agent=a · claim',
      '## ⊣ T2 · agent=a · release · sha=aaa',
      '## ⊢ T3 · agent=b · claim',
      '## ⊣ T4 · agent=b · release · sha=bbb',
    );
    const r = parseLogCycles(input);
    expect(r.cycles).toHaveLength(2);
    expect(r.cycles[0]!.close?.sha).toBe('aaa');
    expect(r.cycles[1]!.close?.sha).toBe('bbb');
  });

  it('treats a claim without release as in-progress (close=null)', () => {
    const input = joinLines(
      '## ⊢ T1 · agent=morrie · claim',
      '- T2 · agent=morrie · tick_task(1)',
    );
    const r = parseLogCycles(input);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.close).toBeNull();
    expect(r.cycles[0]!.entries).toHaveLength(1);
  });

  it('handles a second claim before a release (abandoned cycle, no data loss)', () => {
    // Real-world: agent crashes mid-cycle, next claim picks up. The
    // first cycle's entries must NOT disappear.
    const input = joinLines(
      '## ⊢ T1 · agent=a · claim',
      '- T2 · agent=a · tick_task(1)',
      '## ⊢ T3 · agent=b · claim',
      '## ⊣ T4 · agent=b · release · sha=xyz',
    );
    const r = parseLogCycles(input);
    expect(r.cycles).toHaveLength(2);
    expect(r.cycles[0]!.close).toBeNull(); // abandoned
    expect(r.cycles[0]!.entries).toHaveLength(1); // tick_task(1) preserved
    expect(r.cycles[1]!.close?.sha).toBe('xyz');
  });

  it('preserves header lines (anything before the first marker)', () => {
    const input = joinLines(
      '# Log for spec foo',
      '',
      '## ⊢ T1 · agent=a · claim',
      '## ⊣ T2 · agent=a · release · sha=abc',
    );
    const r = parseLogCycles(input);
    expect(r.header).toEqual(['# Log for spec foo', '']);
    expect(r.cycles).toHaveLength(1);
  });

  it('preserves stray (non-conforming) lines inside a cycle', () => {
    const input = joinLines(
      '## ⊢ T1 · agent=a · claim',
      '<!-- note: tried approach X, failed -->',
      '- T2 · agent=a · tick_task(1)',
      '## ⊣ T3 · agent=a · release · sha=abc',
    );
    const r = parseLogCycles(input);
    const cycle = r.cycles[0]!;
    expect(cycle.entries).toHaveLength(2);
    expect(cycle.entries[0]!.kind).toBe('stray');
    expect(cycle.entries[1]!.kind).toBe('action');
  });

  it('treats an orphan close (no open) as header noise', () => {
    const input = joinLines(
      '## ⊣ T1 · agent=a · release · sha=abc',
      '## ⊢ T2 · agent=a · claim',
      '## ⊣ T3 · agent=a · release · sha=def',
    );
    const r = parseLogCycles(input);
    expect(r.header).toHaveLength(1);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.close?.sha).toBe('def');
  });

  it('round-trips through serialize', () => {
    const input = joinLines(
      '# Header',
      '',
      '## ⊢ T1 · agent=a · claim',
      '- T2 · agent=a · tick_task(1)',
      '<!-- side note -->',
      '## ⊣ T3 · agent=a · release · sha=abc',
    );
    const r = parseLogCycles(input);
    expect(serializeLog(r)).toBe(input);
  });

  it('handles an empty file', () => {
    const r = parseLogCycles('');
    expect(r.cycles).toHaveLength(0);
    expect(r.header).toEqual(['']);
  });
});

describe('rotateLog', () => {
  function makeLog(numComplete: number, includeInProgress = false): string {
    const lines: string[] = [];
    for (let i = 1; i <= numComplete; i++) {
      lines.push(`## ⊢ T${i}a · agent=a · claim`);
      lines.push(`## ⊣ T${i}b · agent=a · release · sha=sha${i}`);
    }
    if (includeInProgress) {
      lines.push(`## ⊢ T${numComplete + 1}a · agent=a · claim`);
      lines.push(`- T${numComplete + 1}b · agent=a · in_progress_action()`);
    }
    return lines.join('\n');
  }

  it('returns input unchanged when below cap', () => {
    const input = makeLog(3);
    expect(rotateLog(input, 50)).toBe(input);
  });

  it('drops oldest complete cycles when above cap', () => {
    const input = makeLog(52);
    const out = rotateLog(input, 50);
    const r = parseLogCycles(out);
    expect(r.cycles).toHaveLength(50);
    // Oldest sha1 / sha2 should be gone; sha3..sha52 retained.
    expect(out).not.toContain('sha=sha1\n');
    expect(out).not.toContain('sha=sha2\n');
    expect(out).toContain('sha=sha3');
    expect(out).toContain('sha=sha52');
  });

  it('exactly at cap is unchanged', () => {
    const input = makeLog(50);
    expect(rotateLog(input, 50)).toBe(input);
  });

  it('never drops an in-progress cycle even when it tips the count', () => {
    const input = makeLog(50, /* +1 in-progress */ true);
    const out = rotateLog(input, 50);
    const r = parseLogCycles(out);
    // 50 complete + 1 in-progress = 51 cycles total, all retained
    // because the 51st is in-progress and untouchable.
    expect(r.cycles).toHaveLength(51);
    expect(r.cycles[50]!.close).toBeNull();
  });

  it('rotates correctly when there is an in-progress cycle AND over cap', () => {
    const input = makeLog(52, /* +1 in-progress */ true);
    const out = rotateLog(input, 50);
    const r = parseLogCycles(out);
    // Should keep 50 complete + 1 in-progress = 51 total
    expect(r.cycles).toHaveLength(51);
    expect(r.cycles.filter((c) => c.close === null)).toHaveLength(1);
  });

  it('throws on negative maxCycles', () => {
    expect(() => rotateLog('', -1)).toThrow(/maxCycles must be >= 0/);
  });

  it('handles empty input', () => {
    expect(rotateLog('', 50)).toBe('');
  });

  it('preserves the header through rotation', () => {
    const header = '# Spec foo log\n\n';
    const cycles = makeLog(52);
    const out = rotateLog(header + cycles, 50);
    expect(out.startsWith(header)).toBe(true);
  });
});

describe('appendClaim / appendAction / appendRelease', () => {
  it('appends a claim to an empty log', () => {
    const out = appendClaim('', { timestamp: 'T1', agentId: 'morrie' });
    expect(out).toContain('## ⊢ T1 · agent=morrie · claim');
  });

  it('appends actions inside an open cycle', () => {
    let log = '';
    log = appendClaim(log, { timestamp: 'T1', agentId: 'a' });
    log = appendAction(log, { timestamp: 'T2', agentId: 'a', action: 'tick_task(1)' });
    log = appendAction(log, { timestamp: 'T3', agentId: 'a', action: 'write_handoff()' });
    const r = parseLogCycles(log);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.entries.filter((e) => e.kind === 'action')).toHaveLength(2);
  });

  it('closes the current cycle on release', () => {
    let log = appendClaim('', { timestamp: 'T1', agentId: 'a' });
    log = appendAction(log, { timestamp: 'T2', agentId: 'a', action: 'tick_task(1)' });
    log = appendRelease(log, { timestamp: 'T3', agentId: 'a', sha: 'abc1234' });
    const r = parseLogCycles(log);
    expect(r.cycles).toHaveLength(1);
    expect(r.cycles[0]!.close?.sha).toBe('abc1234');
  });

  it('appendAction with no open cycle records an orphan comment in the header (no data loss)', () => {
    const out = appendAction('', { timestamp: 'T1', agentId: 'a', action: 'tick_task(1)' });
    expect(out).toContain('orphan action skipped');
  });

  it('appendRelease with no open cycle records an orphan comment in the header', () => {
    const out = appendRelease('', { timestamp: 'T1', agentId: 'a', sha: 'abc' });
    expect(out).toContain('orphan release skipped');
  });

  it('a full cycle round-trip preserves entry order', () => {
    let log = appendClaim('', { timestamp: 'T1', agentId: 'a' });
    log = appendAction(log, { timestamp: 'T2', agentId: 'a', action: 'tick_task(1)' });
    log = appendAction(log, { timestamp: 'T3', agentId: 'a', action: 'tick_task(2)' });
    log = appendAction(log, { timestamp: 'T4', agentId: 'a', action: 'set_status(planned)' });
    log = appendRelease(log, { timestamp: 'T5', agentId: 'a', sha: 'def' });

    const r = parseLogCycles(log);
    const actions = r.cycles[0]!.entries
      .filter((e) => e.kind === 'action')
      .map((e) => (e as { action: string }).action);
    expect(actions).toEqual(['tick_task(1)', 'tick_task(2)', 'set_status(planned)']);
  });

  it('DEFAULT_MAX_CYCLES exports the spec-documented cap', () => {
    expect(DEFAULT_MAX_CYCLES).toBe(50);
  });
});
