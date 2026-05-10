import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  prepareSynthesisContextTool, writeArtifactTool,
} from '../../src/tools/synthesis.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-synth-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [ ] one\n- [x] two\n');
  await fs.mkdir(path.join(tmp, 'specs', 'bar'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'specs', 'bar', 'requirements.md'),
    '---\ndepends_on:\n  - foo\n---\n# bar\n',
  );
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('synthesisTools', () => {
  it('prepare_synthesis_context with scope all returns markdown + derived state for all specs', async () => {
    const result = await prepareSynthesisContextTool.handler(
      { scope: { kind: 'all' } },
      { cwd: tmp },
    );
    expect(result.markdown_bundle).toContain('## Spec: foo');
    expect(result.markdown_bundle).toContain('## Spec: bar');
    const ds = result.derived_state as { specs: Array<{ name: string }> };
    expect(ds.specs.map((s) => s.name).sort()).toEqual(['bar', 'foo']);
    expect(result.template_hint).toContain('<!DOCTYPE html>');
  });

  it('prepare_synthesis_context with scope spec narrows to spec + its deps', async () => {
    const result = await prepareSynthesisContextTool.handler(
      { scope: { kind: 'spec', name: 'bar' } },
      { cwd: tmp },
    );
    const ds = result.derived_state as { specs: Array<{ name: string }> };
    expect(ds.specs.map((s) => s.name).sort()).toEqual(['bar', 'foo']);
  });

  it('write_artifact writes to .zettelgeist/exports/ by default; commits to docs/exports/ when commit:true', async () => {
    const r1 = await writeArtifactTool.handler(
      { name: 'report-1', html: '<html><body>hi</body></html>' },
      { cwd: tmp },
    );
    expect(r1.committed).toBe(false);
    expect(r1.commit_sha).toBeNull();
    expect(r1.path).toBe('.zettelgeist/exports/report-1.html');
    const exists1 = await fs.stat(path.join(tmp, '.zettelgeist', 'exports', 'report-1.html'));
    expect(exists1.isFile()).toBe(true);

    const r2 = await writeArtifactTool.handler(
      { name: 'report-2', html: '<html><body>committed</body></html>', commit: true },
      { cwd: tmp },
    );
    expect(r2.committed).toBe(true);
    expect(r2.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r2.path).toBe('docs/exports/report-2.html');
    const exists2 = await fs.stat(path.join(tmp, 'docs', 'exports', 'report-2.html'));
    expect(exists2.isFile()).toBe(true);
  });
});
