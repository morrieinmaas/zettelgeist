import { describe, expect, it } from 'vitest';
import { parseTasks } from '../src/tasks.js';

describe('parseTasks', () => {
  it('parses empty body to empty array', () => {
    expect(parseTasks('')).toEqual([]);
    expect(parseTasks('# Title only\n\nNo tasks here.\n')).toEqual([]);
  });

  it('parses unchecked and checked boxes preserving order', () => {
    const body = `# Tasks
- [ ] First
- [x] Second
- [ ] Third
`;
    expect(parseTasks(body)).toEqual([
      { index: 1, checked: false, text: 'First', tags: [] },
      { index: 2, checked: true, text: 'Second', tags: [] },
      { index: 3, checked: false, text: 'Third', tags: [] },
    ]);
  });

  it('strips numeric prefix like "1." from the task text', () => {
    const body = `- [ ] 1. Add SAML middleware
- [x] 2. Add OIDC flow
`;
    expect(parseTasks(body)).toEqual([
      { index: 1, checked: false, text: 'Add SAML middleware', tags: [] },
      { index: 2, checked: true, text: 'Add OIDC flow', tags: [] },
    ]);
  });

  it('detects inline tags (#human-only, #agent-only, #skip)', () => {
    const body = `- [ ] 1. Write docs #human-only
- [ ] 2. Run migration #agent-only
- [ ] 3. Maybe later #skip
`;
    const tasks = parseTasks(body);
    expect(tasks[0]?.tags).toEqual(['#human-only']);
    expect(tasks[1]?.tags).toEqual(['#agent-only']);
    expect(tasks[2]?.tags).toEqual(['#skip']);
  });

  it('ignores hash-words that are not the canonical tags', () => {
    const tasks = parseTasks('- [ ] Use #other or #HUMAN-ONLY (wrong case)\n');
    expect(tasks[0]?.tags).toEqual([]);
  });

  it('accepts uppercase X as checked', () => {
    expect(parseTasks('- [X] Done\n')).toEqual([
      { index: 1, checked: true, text: 'Done', tags: [] },
    ]);
  });

  it('ignores lines that are not GitHub-flavored task list items', () => {
    const body = `Some prose
- A bullet without a checkbox
1. A numbered list without a checkbox
- [ ] Real task
`;
    expect(parseTasks(body)).toEqual([
      { index: 1, checked: false, text: 'Real task', tags: [] },
    ]);
  });
});
