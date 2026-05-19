import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import {
  DEFAULT_CONFIG,
  DEFAULT_GITIGNORE_BLOCK,
  GITIGNORE_MARKER_BEGIN,
  GITIGNORE_MARKER_END,
  INIT_DIRS,
  gitignoreWithMarkerBlock,
} from '../src/init-defaults.js';

describe('DEFAULT_CONFIG', () => {
  it('parses as valid YAML', () => {
    const data = yaml.load(DEFAULT_CONFIG) as Record<string, unknown>;
    expect(data['format_version']).toBe('0.1');
  });

  it('quotes format_version (matches loadConfig\'s string-only expectation)', () => {
    // Loadconfig rejects unquoted numeric versions per §3 of the format spec.
    // The default must always be a string literal.
    expect(DEFAULT_CONFIG).toMatch(/format_version:\s*"0\.1"/);
  });
});

describe('DEFAULT_GITIGNORE_BLOCK', () => {
  it('contains the marker pair so the block is idempotent on re-run', () => {
    expect(DEFAULT_GITIGNORE_BLOCK).toContain(GITIGNORE_MARKER_BEGIN);
    expect(DEFAULT_GITIGNORE_BLOCK).toContain(GITIGNORE_MARKER_END);
  });

  it('gitignores per-actor claim files (v0.2 distributed-conflict design)', () => {
    expect(DEFAULT_GITIGNORE_BLOCK).toContain('specs/*/.claim');
    expect(DEFAULT_GITIGNORE_BLOCK).toContain('specs/*/.claim-*');
  });

  it('gitignores tool-managed state (regen cache + exports)', () => {
    expect(DEFAULT_GITIGNORE_BLOCK).toContain('.zettelgeist/regen-cache.json');
    expect(DEFAULT_GITIGNORE_BLOCK).toContain('.zettelgeist/exports/');
  });

  it('ends with a single trailing newline (so an append doesn\'t produce blank-line drift)', () => {
    expect(DEFAULT_GITIGNORE_BLOCK.endsWith('\n')).toBe(true);
    expect(DEFAULT_GITIGNORE_BLOCK.endsWith('\n\n')).toBe(false);
  });
});

describe('INIT_DIRS', () => {
  it('is the canonical three-dir layout in deterministic order', () => {
    // Order matters because the CLI's `created` array is user-facing
    // and ordering changes would surface as a UX diff.
    expect([...INIT_DIRS]).toEqual(['specs', 'docs', '.zettelgeist']);
  });
});

describe('gitignoreWithMarkerBlock', () => {
  it('appends the block to an empty .gitignore', () => {
    const r = gitignoreWithMarkerBlock('');
    expect(r).not.toBeNull();
    expect(r).toContain(GITIGNORE_MARKER_BEGIN);
  });

  it('appends to a non-empty .gitignore with a trailing newline', () => {
    const r = gitignoreWithMarkerBlock('node_modules/\ndist/\n');
    expect(r).not.toBeNull();
    expect(r).toMatch(/^node_modules\/\ndist\/\n# >>> zettelgeist >>>/m);
  });

  it('adds a separating newline when the existing file lacks a trailing one', () => {
    const r = gitignoreWithMarkerBlock('foo.txt');
    expect(r).not.toBeNull();
    // Crucially: no `foo.txt# >>>` run-on.
    expect(r).toMatch(/^foo\.txt\n# >>> zettelgeist >>>/m);
  });

  it('returns null when the marker is already present (idempotent)', () => {
    const existing = 'a\n' + DEFAULT_GITIGNORE_BLOCK + 'b\n';
    expect(gitignoreWithMarkerBlock(existing)).toBeNull();
  });
});
