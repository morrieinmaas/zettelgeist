import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  writeSpecFileTool, writeHandoffTool,
  tickTaskTool, untickTaskTool, setStatusTool,
} from '../../src/tools/write.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-write-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
  await fs.writeFile(
    path.join(tmp, 'specs', 'foo', 'tasks.md'),
    '- [ ] one\n- [ ] two\n- [ ] three\n',
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

describe('writeTools', () => {
  it('write_spec_file produces a commit', async () => {
    const result = await writeSpecFileTool.handler(
      { name: 'foo', relpath: 'lenses/design.md', content: '# design\n' },
      { cwd: tmp },
    );
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const written = await fs.readFile(path.join(tmp, 'specs', 'foo', 'lenses', 'design.md'), 'utf8');
    expect(written).toBe('# design\n');
  });

  it('write_handoff writes handoff.md and commits', async () => {
    const result = await writeHandoffTool.handler(
      { name: 'foo', content: 'all done\n' },
      { cwd: tmp },
    );
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const handoff = await fs.readFile(path.join(tmp, 'specs', 'foo', 'handoff.md'), 'utf8');
    expect(handoff).toBe('all done\n');
  });

  it('tick_task ticks the nth task and commits', async () => {
    const result = await tickTaskTool.handler({ name: 'foo', n: 2 }, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const after = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(after).toBe('- [ ] one\n- [x] two\n- [ ] three\n');
  });

  it('untick_task reverses a tick', async () => {
    await tickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
    const result = await untickTaskTool.handler({ name: 'foo', n: 1 }, { cwd: tmp });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const after = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(after.startsWith('- [ ] one')).toBe(true);
  });

  it('writeSpecFileTool rejects relpath with traversal', async () => {
    await expect(writeSpecFileTool.handler(
      { name: 'foo', relpath: '../../evil.txt', content: 'pwn' },
      { cwd: tmp },
    )).rejects.toThrow();
    const exists = await fs.access(path.join(tmp, '..', 'evil.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('writeSpecFileTool rejects spec name with traversal', async () => {
    await expect(writeSpecFileTool.handler(
      { name: '../../etc', relpath: 'passwd', content: 'pwn' },
      { cwd: tmp },
    )).rejects.toThrow();
  });

  it('set_status writes frontmatter and clears it on null', async () => {
    const set = await setStatusTool.handler(
      { name: 'foo', status: 'blocked', reason: 'waiting on creds' },
      { cwd: tmp },
    );
    expect(set.commit).toMatch(/^[0-9a-f]{40}$/);
    const after1 = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(after1).toContain('status: blocked');
    expect(after1).toContain('blocked_by: waiting on creds');

    const cleared = await setStatusTool.handler(
      { name: 'foo', status: null },
      { cwd: tmp },
    );
    expect(cleared.commit).toMatch(/^[0-9a-f]{40}$/);
    const after2 = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(after2).not.toContain('status:');
    expect(after2).not.toContain('blocked_by:');
  });
});
