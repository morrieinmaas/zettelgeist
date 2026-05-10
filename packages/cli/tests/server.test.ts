import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startServer, type ServerHandle } from '../src/server.js';

let tmp: string;
let viewerBundle: string;
let server: ServerHandle | null;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-server-'));
  viewerBundle = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-bundle-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.1"\n');
  await fs.writeFile(
    path.join(viewerBundle, 'index.html'),
    '<html><head><title>Test</title></head><body>'
    + '<main id="app"></main>'
    + '<script type="module" src="./main.js"></script>'
    + '</body></html>',
  );
  await fs.writeFile(path.join(viewerBundle, 'main.js'), '// stub');
  await fs.writeFile(path.join(viewerBundle, 'base.css'), '/* stub */');
  server = null;
});

afterEach(async () => {
  if (server) await server.stop();
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(viewerBundle, { recursive: true, force: true });
});

describe('startServer', () => {
  it('serves index.html with injected config script', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('window.zettelgeistConfig');
  });

  it('serves main.js as JavaScript', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/main.js`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('javascript');
  });

  it('lists specs (empty repo)', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toEqual([]);
  });

  it('lists specs with one spec', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# Foo\n');
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/specs`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('foo');
  });

  it('serves user CSS override 404 when missing', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/static/user-overrides.css`);
    expect(r.status).toBe(404);
  });

  it('serves user CSS override when present', async () => {
    await fs.mkdir(path.join(tmp, '.zettelgeist', 'render-templates'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.zettelgeist', 'render-templates', 'viewer.css'), '.x { color: red; }');
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/static/user-overrides.css`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('color: red');
  });

  it('returns 404 for unknown routes', async () => {
    server = await startServer({ cwd: tmp, port: 0, viewerBundlePath: viewerBundle });
    const r = await fetch(`${server.url}/api/nonsense`);
    expect(r.status).toBe(404);
  });
});
