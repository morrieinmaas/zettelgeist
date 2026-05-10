import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exportDocCommand } from '../src/commands/export-doc.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-export-'));
  await fs.mkdir(path.join(tmp, 'docs'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('exportDocCommand', () => {
  it('renders a basic markdown doc with the default template', async () => {
    await fs.writeFile(
      path.join(tmp, 'docs', 'foo.md'),
      '# Hello\n\nA paragraph.\n',
    );
    const r = await exportDocCommand({ cwd: tmp, source: 'docs/foo.md' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.output).toBe('.zettelgeist/exports/foo.html');
    const html = await fs.readFile(path.join(tmp, '.zettelgeist', 'exports', 'foo.html'), 'utf8');
    expect(html).toContain('<title>Hello</title>');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello</h1>');
    expect(html).toContain('A paragraph.');
    expect(html).toContain('Zettelgeist 0.1.0');
  });

  it('extracts title from frontmatter when present', async () => {
    await fs.writeFile(
      path.join(tmp, 'docs', 'foo.md'),
      '---\ntitle: From Frontmatter\n---\n# Different H1\n',
    );
    const r = await exportDocCommand({ cwd: tmp, source: 'docs/foo.md' });
    expect(r.ok).toBe(true);
    const html = await fs.readFile(path.join(tmp, '.zettelgeist', 'exports', 'foo.html'), 'utf8');
    expect(html).toContain('<title>From Frontmatter</title>');
  });

  it('uses custom template via templatePath', async () => {
    await fs.writeFile(path.join(tmp, 'docs', 'foo.md'), '# T\n\nbody.\n');
    await fs.writeFile(path.join(tmp, 'my.html'), '<h1>{{title}}</h1>{{content}}');
    const r = await exportDocCommand({ cwd: tmp, source: 'docs/foo.md', templatePath: 'my.html' });
    expect(r.ok).toBe(true);
    const html = await fs.readFile(path.join(tmp, '.zettelgeist', 'exports', 'foo.html'), 'utf8');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('body.');
  });

  it('rejects unknown placeholder in custom template', async () => {
    await fs.writeFile(path.join(tmp, 'docs', 'foo.md'), '# T\n');
    await fs.writeFile(path.join(tmp, 'bad.html'), '<h1>{{title}}</h1>{{nonsense}}');
    const r = await exportDocCommand({ cwd: tmp, source: 'docs/foo.md', templatePath: 'bad.html' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const detail = r.error.detail as { errors: string[] };
      expect(detail.errors.some((e) => e.includes('nonsense'))).toBe(true);
    }
  });

  it('returns error when source missing', async () => {
    const r = await exportDocCommand({ cwd: tmp, source: 'missing.md' });
    expect(r.ok).toBe(false);
  });

  it('exposes frontmatter via {{frontmatter.<key>}}', async () => {
    await fs.writeFile(path.join(tmp, 'docs', 'foo.md'), '---\nauthor: Mo\n---\n# T\n');
    await fs.writeFile(path.join(tmp, 'my.html'), '{{title}} by {{frontmatter.author}}\n{{content}}');
    const r = await exportDocCommand({ cwd: tmp, source: 'docs/foo.md', templatePath: 'my.html' });
    expect(r.ok).toBe(true);
    const html = await fs.readFile(path.join(tmp, '.zettelgeist', 'exports', 'foo.html'), 'utf8');
    expect(html).toContain('T by Mo');
  });
});
