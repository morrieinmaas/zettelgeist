import { promises as fsp, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runConformance } from '@zettelgeist/core';
import { makeDiskFsReader } from '../src/run.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(here, '../../fixtures');

const fixtureNames = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe('conformance fixtures', () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const fixtureDir = path.join(FIXTURES_DIR, name);
      const inputDir = path.join(fixtureDir, 'input');
      const expectedDir = path.join(fixtureDir, 'expected');

      const reader = makeDiskFsReader(inputDir);
      const actual = await runConformance(reader);

      const expectedStatuses = JSON.parse(await fsp.readFile(path.join(expectedDir, 'statuses.json'), 'utf8'));
      const expectedGraph = JSON.parse(await fsp.readFile(path.join(expectedDir, 'graph.json'), 'utf8'));
      const expectedValidation = JSON.parse(await fsp.readFile(path.join(expectedDir, 'validation.json'), 'utf8'));
      const expectedIndex = await fsp.readFile(path.join(expectedDir, 'INDEX.md'), 'utf8');

      // Validation errors are matched on { code, path } only — strip other fields per spec §11.
      const stripDetails = (errs: unknown[]): unknown[] =>
        (errs as Array<Record<string, unknown>>).map(({ code, path: p }) => ({ code, path: p }));

      expect(actual.statuses).toEqual(expectedStatuses);
      expect(actual.graph).toEqual(expectedGraph);
      expect(stripDetails(actual.validation.errors)).toEqual(stripDetails(expectedValidation.errors));
      expect(actual.index).toBe(expectedIndex); // byte-exact
    });
  }
});
