import { describe, expect, it } from 'vitest';
import { sanitizeAgentId, scanClaimedSpecs, defaultAgentId } from '../src/loader.js';
import { makeMemFsReader as makeMemFs } from './helpers/mem-fs.js';

describe('sanitizeAgentId', () => {
  it('passes through a clean slug unchanged', () => {
    expect(sanitizeAgentId('alice')).toBe('alice');
    expect(sanitizeAgentId('alice-laptop')).toBe('alice-laptop');
    expect(sanitizeAgentId('alice.local_1')).toBe('alice.local_1');
  });

  it('preserves case — Alice and alice are distinct on case-sensitive filesystems', () => {
    expect(sanitizeAgentId('Alice')).toBe('Alice');
    expect(sanitizeAgentId('ALICE')).toBe('ALICE');
    expect(sanitizeAgentId('aLiCe')).toBe('aLiCe');
  });

  it('replaces forbidden characters with a single dash', () => {
    expect(sanitizeAgentId('alice@laptop.local')).toBe('alice-laptop.local');
    expect(sanitizeAgentId('hi there')).toBe('hi-there');
    expect(sanitizeAgentId('a/b/c')).toBe('a-b-c');
  });

  it('collapses runs of dashes into one', () => {
    expect(sanitizeAgentId('a!!b')).toBe('a-b');
    expect(sanitizeAgentId('a???b???c')).toBe('a-b-c');
  });

  it('strips leading and trailing dots and dashes (no double-hidden files)', () => {
    expect(sanitizeAgentId('.alice')).toBe('alice');
    expect(sanitizeAgentId('-alice')).toBe('alice');
    expect(sanitizeAgentId('..alice..')).toBe('alice');
    expect(sanitizeAgentId('--alice--')).toBe('alice');
  });

  it('falls back to "agent" on empty or unsalvageable input', () => {
    expect(sanitizeAgentId(undefined)).toBe('agent');
    expect(sanitizeAgentId('')).toBe('agent');
    expect(sanitizeAgentId('---')).toBe('agent');
    expect(sanitizeAgentId('...')).toBe('agent');
    expect(sanitizeAgentId('@@@')).toBe('agent');
  });

  it('rejects path-traversal segments by collapsing dots and dashes', () => {
    expect(sanitizeAgentId('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeAgentId('..')).toBe('agent');
    expect(sanitizeAgentId('../..')).toBe('agent');
  });

  it('caps the slug at 64 characters (filename headroom under 255-byte FS limits)', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeAgentId(long)).toHaveLength(64);
    expect(sanitizeAgentId(long)).toBe('a'.repeat(64));
  });

  it('re-trims after the 64-char slice to avoid trailing dash from a cut run', () => {
    // 63 a's + a dash → after slice would be 63 a's + 1 dash; trim to 63 a's
    const input = `${'a'.repeat(63)}-stuff`;
    const out = sanitizeAgentId(input);
    expect(out).toBe('a'.repeat(63));
    expect(out.endsWith('-')).toBe(false);
  });

  it('applies NFC unicode normalization before sanitization', () => {
    // "café" composed (NFC) vs decomposed (NFD) should hash to the same slug
    const nfc = 'é'; // é as one codepoint
    const nfd = 'é'; // e + combining acute
    expect(sanitizeAgentId(`alic${nfc}`)).toBe(sanitizeAgentId(`alic${nfd}`));
  });

  it('strips null bytes (defensive against malformed input)', () => {
    expect(sanitizeAgentId('ali\x00ce')).toBe('ali-ce');
  });

  it('handles only special characters by falling back', () => {
    expect(sanitizeAgentId('   ')).toBe('agent');
    expect(sanitizeAgentId('\t\n')).toBe('agent');
  });
});

describe('defaultAgentId', () => {
  it('returns a non-empty slug', () => {
    const slug = defaultAgentId();
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.length).toBeLessThanOrEqual(64);
  });

  it('embeds the current pid', () => {
    expect(defaultAgentId()).toContain(String(process.pid));
  });

  it('survives sanitization (no forbidden characters in output)', () => {
    expect(defaultAgentId()).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('scanClaimedSpecs', () => {
  it('returns an empty set when specsDir is missing', async () => {
    const fs = makeMemFs({});
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set());
  });

  it('detects a legacy single .claim', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/.claim': 'alice\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['foo']));
  });

  it('detects a per-actor .claim-<slug>', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/.claim-alice': 'alice\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['foo']));
  });

  it('detects multiple per-actor files on the same spec (one set entry)', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/.claim-alice': 'alice\n',
      'specs/foo/.claim-bob': 'bob\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['foo']));
  });

  it('detects legacy and per-actor coexisting on the same spec', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/.claim': 'legacy\n',
      'specs/foo/.claim-bob': 'bob\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['foo']));
  });

  it('reports only claimed specs across a mix', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/.claim-alice': 'alice\n',
      'specs/bar/requirements.md': '# Bar',
      // bar has no claim
      'specs/baz/requirements.md': '# Baz',
      'specs/baz/.claim': 'legacy\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['foo', 'baz']));
  });

  it('skips spec dirs whose names fail SPEC_NAME (silent, no error)', async () => {
    const fs = makeMemFs({
      'specs/Foo/requirements.md': '# Foo with uppercase',
      'specs/Foo/.claim-alice': 'alice\n',
      'specs/valid/requirements.md': '# valid',
      'specs/valid/.claim': 'legacy\n',
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set(['valid']));
  });

  it('does not match `.claim` as a prefix of unrelated files', async () => {
    const fs = makeMemFs({
      'specs/foo/requirements.md': '# Foo',
      'specs/foo/claim-notes.md': 'not a claim — no leading dot',
      // .claim-extra would match — only test that "claim-notes.md" (no dot) doesn't
    });
    expect(await scanClaimedSpecs(fs, 'specs')).toEqual(new Set());
  });

  it('respects a custom specsDir', async () => {
    const fs = makeMemFs({
      'docs/specs/foo/requirements.md': '# Foo',
      'docs/specs/foo/.claim': 'alice\n',
    });
    expect(await scanClaimedSpecs(fs, 'docs/specs')).toEqual(new Set(['foo']));
  });
});
