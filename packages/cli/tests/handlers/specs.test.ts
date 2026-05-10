import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { startServer, type ServerHandle } from '../../src/server.js';

const execFileP = promisify(execFile);

let tmp: string;
let viewerBundle: string;
let server: ServerHandle | null;

async function setupRepo(): Promise<void> {
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# Foo\n');
  await fs.writeFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), '- [ ] 1. one\n- [ ] 2. two\n');
  await execFileP('git', ['init', '-q'], { cwd: tmp });
  await execFileP('git', ['config', 'user.email', 't@e'], { cwd: tmp });
  await execFileP('git', ['config', 'user.name', 'T'], { cwd: tmp });
  await execFileP('git', ['add', '.'], { cwd: tmp });
  await execFileP('git', ['commit', '-q', '-m', 'init'], { cwd: tmp });
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-specs-handler-'));
  viewerBundle = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-bundle-'));
  await fs.writeFile(path.join(viewerBundle, 'index.html'), '<html></html>');
  server = null;
});

afterEach(async () => {
  if (server) await server.stop();
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(viewerBundle, { recursive: true, force: true });
});

describe('specs routes', () => {
  it('GET /api/specs/foo returns spec detail', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.name).toBe('foo');
    expect(data.tasks).toHaveLength(2);
  });

  it('POST /api/specs/foo/tasks/1/tick flips task and produces commit', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/tasks/1/tick`, { method: 'POST' });
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.commit).toMatch(/^[0-9a-f]{40}$/);
    const tasks = await fs.readFile(path.join(tmp, 'specs', 'foo', 'tasks.md'), 'utf8');
    expect(tasks).toContain('[x]');
  });

  it('POST /api/specs/foo/status sets blocked', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'blocked', reason: 'IDP creds' }),
    });
    expect(r.status).toBe(200);
    const reqs = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(reqs).toContain('status: blocked');
    expect(reqs).toContain('blocked_by: IDP creds');
  });

  it('POST /api/specs/foo/claim writes .claim', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'alice@laptop' }),
    });
    expect(r.status).toBe(200);
    const claim = await fs.readFile(path.join(tmp, 'specs', 'foo', '.claim'), 'utf8');
    expect(claim).toContain('alice@laptop');
  });
});

describe('error paths', () => {
  it('PUT body without content field returns 400', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/files/requirements.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it('POST set_status with invalid status returns 400', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'made-up-status' }),
    });
    expect(r.status).toBe(400);
  });

  it('non-JSON body on a POST endpoint is treated as null and rejected', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(r.status).toBe(400);
  });

  it('DELETE on /api/specs returns 404', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs`, { method: 'DELETE' });
    expect(r.status).toBe(404);
  });

  it('GET /api/specs/<name>/files/<path> for missing file returns 404', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/files/no-such-file.md`);
    expect(r.status).toBe(404);
  });

  it('tick on a missing spec returns 404', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/ghost/tasks/1/tick`, { method: 'POST' });
    expect(r.status).toBe(404);
  });

  it('tick with out-of-range index returns 400', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/tasks/99/tick`, { method: 'POST' });
    expect(r.status).toBe(400);
  });
});

describe('path traversal', () => {
  it('rejects readSpecFile with .. in relpath', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    // create a sentinel file outside specsDir
    await fs.writeFile(path.join(tmp, 'SENTINEL'), 'do-not-leak');
    const r = await fetch(`${server.url}/api/specs/foo/files/..%2F..%2FSENTINEL`);
    expect(r.status).toBe(403);
  });

  it('rejects writeSpecFile with .. in relpath', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/files/..%2F..%2Fevil.txt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'pwn' }),
    });
    expect(r.status).toBe(403);
    const exists = await fs.access(path.join(tmp, '..', 'evil.txt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('rejects spec name with .. (tasks endpoint)', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/..%2F..%2Fevil/tasks/1/tick`, { method: 'POST' });
    // Either 403 or 404 — both acceptable; 200 with action would be a bug
    expect([403, 404]).toContain(r.status);
  });
});
