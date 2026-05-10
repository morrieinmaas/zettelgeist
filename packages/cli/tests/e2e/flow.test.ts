import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { startServer, type ServerHandle } from '../../src/server.js';

const execFileP = promisify(execFile);

let tmp: string;
let server: ServerHandle | null;
let viewerBundle: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-flow-'));
  viewerBundle = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-bundle-'));
  await fs.writeFile(path.join(viewerBundle, 'index.html'), '<html></html>');
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 'a@b'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
  server = null;
});

afterEach(async () => {
  if (server) await server.stop();
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(viewerBundle, { recursive: true, force: true });
});

describe('end-to-end agent → CLI → viewer flow', () => {
  it('REST write spec → list shows it → tick produces commit → list reflects new state', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });

    // 1. Agent (or any client) writes spec content via REST
    const putReq = await fetch(`${server.url}/api/specs/demo/files/requirements.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Demo\n' }),
    });
    expect(putReq.status).toBe(200);
    const putTasks = await fetch(`${server.url}/api/specs/demo/files/tasks.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '- [ ] 1. first\n- [ ] 2. second\n' }),
    });
    expect(putTasks.status).toBe(200);

    // 2. CLI serve lists it via REST
    const listResp = await fetch(`${server.url}/api/specs`);
    expect(listResp.status).toBe(200);
    const specs = await listResp.json() as Array<{ name: string; status: string; progress: string }>;
    expect(specs).toHaveLength(1);
    expect(specs[0]?.name).toBe('demo');
    expect(specs[0]?.status).toBe('planned');
    expect(specs[0]?.progress).toBe('0/2');

    // 3. User clicks tick via REST
    const tickResp = await fetch(`${server.url}/api/specs/demo/tasks/1/tick`, { method: 'POST' });
    expect(tickResp.status).toBe(200);
    const tickBody = await tickResp.json() as { commit: string };
    expect(tickBody.commit).toMatch(/^[0-9a-f]{40}$/);

    // 4. State propagated: list now shows in-progress + 1/2
    const listResp2 = await fetch(`${server.url}/api/specs`);
    const specs2 = await listResp2.json() as Array<{ status: string; progress: string }>;
    expect(specs2[0]?.status).toBe('in-progress');
    expect(specs2[0]?.progress).toBe('1/2');
  });
});
