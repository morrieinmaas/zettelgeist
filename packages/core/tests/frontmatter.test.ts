import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns empty data and full body when no frontmatter is present', () => {
    const result = parseFrontmatter('# Title\n\nBody text.\n');
    expect(result.data).toEqual({});
    expect(result.body).toBe('# Title\n\nBody text.\n');
    expect(result.error).toBeNull();
  });

  it('parses YAML frontmatter and returns the remaining body', () => {
    const text = '---\nstatus: blocked\ndepends_on:\n  - foo\n---\n# Body\n';
    const result = parseFrontmatter(text);
    expect(result.data).toEqual({ status: 'blocked', depends_on: ['foo'] });
    expect(result.body).toBe('# Body\n');
    expect(result.error).toBeNull();
  });

  it('returns an error object when YAML is malformed', () => {
    const text = '---\nstatus: [unterminated\n---\nBody\n';
    const result = parseFrontmatter(text);
    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe('E_INVALID_FRONTMATTER');
  });

  it('treats fully empty frontmatter as empty data', () => {
    const text = '---\n---\nBody\n';
    const result = parseFrontmatter(text);
    expect(result.data).toEqual({});
    expect(result.body).toBe('Body\n');
    expect(result.error).toBeNull();
  });
});
