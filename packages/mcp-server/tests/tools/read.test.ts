import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  listSpecsTool, readSpecTool, readSpecFileTool, validateRepoTool,
} from '../../src/tools/read.js';

const execFileP = promisify(execFile);
let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-mcp-read-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, 'specs', 'foo', 'requirements.md'),
    '# foo\n',
  );
  await fs.writeFile(
    path.join(tmp, 'specs', 'foo', 'tasks.md'),
    '- [ ] one\n- [x] two\n- [ ] three\n',
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

describe('readTools', () => {
  it('list_specs returns specs with derived state', async () => {
    const result = await listSpecsTool.handler({}, { cwd: tmp });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('foo');
    expect(result[0]?.progress).toBe('1/3');
    expect(result[0]?.blockedBy).toBeNull();
  });

  it('read_spec returns full spec contents', async () => {
    const result = await readSpecTool.handler({ name: 'foo' }, { cwd: tmp });
    expect(result.name).toBe('foo');
    expect(result.requirements).toContain('# foo');
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[1]?.checked).toBe(true);
  });

  it('read_spec_file returns one file', async () => {
    const result = await readSpecFileTool.handler({ name: 'foo', relpath: 'tasks.md' }, { cwd: tmp });
    expect(result.content).toContain('- [ ] one');
    expect(result.content).toContain('- [x] two');
  });

  it('validate_repo returns no errors on a clean repo', async () => {
    const result = await validateRepoTool.handler({}, { cwd: tmp });
    expect(result.errors).toEqual([]);
  });

  it('validate_repo surfaces E_EMPTY_SPEC for empty spec folders', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'empty'));
    const result = await validateRepoTool.handler({}, { cwd: tmp });
    expect(result.errors.some((e) => e.code === 'E_EMPTY_SPEC')).toBe(true);
  });
});
