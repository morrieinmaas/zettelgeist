import { describe, expect, it } from 'vitest';
import { parseInvocation } from '../src/router.js';

describe('parseInvocation', () => {
  it('parses a bare command', () => {
    expect(parseInvocation(['regen'])).toEqual({
      kind: 'command',
      name: 'regen',
      args: [],
      flags: { json: false, help: false },
    });
  });

  it('parses positional args after the command', () => {
    expect(parseInvocation(['export-doc', 'docs/foo.md'])).toEqual({
      kind: 'command',
      name: 'export-doc',
      args: ['docs/foo.md'],
      flags: { json: false, help: false },
    });
  });

  it('parses --json flag', () => {
    expect(parseInvocation(['regen', '--json'])).toEqual({
      kind: 'command',
      name: 'regen',
      args: [],
      flags: { json: true, help: false },
    });
  });

  it('parses --check flag (regen-specific)', () => {
    const inv = parseInvocation(['regen', '--check']);
    expect(inv).toMatchObject({ kind: 'command', name: 'regen' });
    expect(inv.kind === 'command' && inv.flags.check).toBe(true);
  });

  it('parses --port and --no-open for serve', () => {
    const inv = parseInvocation(['serve', '--port', '8080', '--no-open']);
    expect(inv).toMatchObject({ kind: 'command', name: 'serve' });
    if (inv.kind === 'command') {
      expect(inv.flags.port).toBe('8080');
      expect(inv.flags['no-open']).toBe(true);
    }
  });

  it('parses --template for export-doc', () => {
    const inv = parseInvocation(['export-doc', 'docs/foo.md', '--template', 'my.html']);
    expect(inv).toMatchObject({ kind: 'command', name: 'export-doc' });
    if (inv.kind === 'command') expect(inv.flags.template).toBe('my.html');
  });

  it('treats no arguments as help request', () => {
    expect(parseInvocation([])).toEqual({ kind: 'help', topic: null });
  });

  it('treats --help as help request', () => {
    expect(parseInvocation(['--help'])).toEqual({ kind: 'help', topic: null });
    expect(parseInvocation(['regen', '--help'])).toEqual({ kind: 'help', topic: 'regen' });
  });

  it('returns unknown-command for unrecognized commands', () => {
    expect(parseInvocation(['floob'])).toEqual({
      kind: 'unknown-command',
      name: 'floob',
    });
  });
});
