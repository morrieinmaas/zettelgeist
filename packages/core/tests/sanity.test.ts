import { expect, test } from 'vitest';
import type { Status } from '../src/index.js';

test('Status type compiles and re-exports cleanly', () => {
  const s: Status = 'draft';
  expect(s).toBe('draft');
});
