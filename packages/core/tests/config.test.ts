import { describe, expect, it } from 'vitest';
import type { FsReader } from '../src/loader.js';
import { loadConfig } from '../src/config.js';

function makeFs(content: string): FsReader {
  return {
    async readDir() {
      return [];
    },
    async readFile(p) {
      if (p === '.zettelgeist.yaml') return content;
      throw new Error(`ENOENT: ${p}`);
    },
    async exists(p) {
      return p === '.zettelgeist.yaml';
    },
  };
}

describe('loadConfig', () => {
  it('returns format_version and default specsDir for a minimal valid config', async () => {
    const fs = makeFs('format_version: "0.1"\n');
    const r = await loadConfig(fs);
    expect(r.config).toEqual({ formatVersion: '0.1', specsDir: 'specs' });
    expect(r.errors).toEqual([]);
  });

  it('honors a custom specs_dir when set', async () => {
    const fs = makeFs('format_version: "0.1"\nspecs_dir: docs/specs\n');
    const r = await loadConfig(fs);
    expect(r.config).toEqual({ formatVersion: '0.1', specsDir: 'docs/specs' });
    expect(r.errors).toEqual([]);
  });

  it('emits E_INVALID_FRONTMATTER when format_version is missing', async () => {
    const fs = makeFs('specs_dir: specs\n');
    const r = await loadConfig(fs);
    expect(r.config.formatVersion).toBeNull();
    expect(r.errors).toEqual([
      {
        code: 'E_INVALID_FRONTMATTER',
        path: '.zettelgeist.yaml',
        detail: 'format_version must be a string',
      },
    ]);
  });

  it('emits E_INVALID_FRONTMATTER when format_version is a number', async () => {
    const fs = makeFs('format_version: 0.1\n');
    const r = await loadConfig(fs);
    expect(r.config.formatVersion).toBeNull();
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.code).toBe('E_INVALID_FRONTMATTER');
    expect(r.errors[0]?.path).toBe('.zettelgeist.yaml');
  });

  it('emits E_INVALID_FRONTMATTER on malformed YAML and returns defaults', async () => {
    const fs = makeFs('format_version: [unterminated\n');
    const r = await loadConfig(fs);
    expect(r.config).toEqual({ formatVersion: null, specsDir: 'specs' });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.code).toBe('E_INVALID_FRONTMATTER');
    expect(r.errors[0]?.path).toBe('.zettelgeist.yaml');
  });

  it('emits E_INVALID_FRONTMATTER when specs_dir is a number, falling back to default', async () => {
    const fs = makeFs('format_version: "0.1"\nspecs_dir: 42\n');
    const r = await loadConfig(fs);
    expect(r.config).toEqual({ formatVersion: '0.1', specsDir: 'specs' });
    expect(r.errors).toEqual([
      {
        code: 'E_INVALID_FRONTMATTER',
        path: '.zettelgeist.yaml',
        detail: 'specs_dir must be a string',
      },
    ]);
  });

  it('treats an empty file as missing format_version', async () => {
    const fs = makeFs('');
    const r = await loadConfig(fs);
    expect(r.config).toEqual({ formatVersion: null, specsDir: 'specs' });
    expect(r.errors).toEqual([
      {
        code: 'E_INVALID_FRONTMATTER',
        path: '.zettelgeist.yaml',
        detail: 'format_version must be a string',
      },
    ]);
  });
});
