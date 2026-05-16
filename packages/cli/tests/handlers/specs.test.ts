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

  it('POST /api/specs/foo/claim writes a per-actor .claim-<slug>', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'alice@laptop' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { acknowledged: true; agent_id: string };
    expect(body.agent_id).toBe('alice-laptop'); // sanitized: @ -> -
    const claim = await fs.readFile(
      path.join(tmp, 'specs', 'foo', '.claim-alice-laptop'),
      'utf8',
    );
    expect(claim).toContain('alice@laptop'); // raw id preserved in body for diagnostics
  });

  it('two agents claiming the same spec produce two distinct files', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'alice' }),
    });
    await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'bob' }),
    });
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-alice'));
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-bob'));
  });

  it('release_spec only removes the calling agent\'s file', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'alice' }),
    });
    await fetch(`${server.url}/api/specs/foo/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'bob' }),
    });
    const r = await fetch(`${server.url}/api/specs/foo/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'alice' }),
    });
    expect(r.status).toBe(200);
    await expect(fs.access(path.join(tmp, 'specs', 'foo', '.claim-alice'))).rejects.toThrow();
    await fs.access(path.join(tmp, 'specs', 'foo', '.claim-bob'));   // still there
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

  it('PATCH /api/specs/<name>/frontmatter writes patch fields and commits', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/frontmatter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { pr: 'https://github.com/x/y/pull/1', branch: 'feat/a' } }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(typeof body.commit).toBe('string');
    const req = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(req).toContain('pr: ');
    expect(req).toContain('branch: feat/a');
  });

  it('PATCH /frontmatter with status key returns 400', async () => {
    await setupRepo();
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/frontmatter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { status: 'done' } }),
    });
    expect(r.status).toBe(400);
  });

  it('PATCH /frontmatter with null value deletes the key', async () => {
    await setupRepo();
    // pre-seed pr in frontmatter
    await fs.writeFile(
      path.join(tmp, 'specs', 'foo', 'requirements.md'),
      '---\npr: https://x/pull/2\n---\n# Foo\n',
    );
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs/foo/frontmatter`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch: { pr: null } }),
    });
    expect(r.status).toBe(200);
    const req = await fs.readFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), 'utf8');
    expect(req).not.toContain('pr:');
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
