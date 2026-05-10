import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { startServer, type ServerHandle } from '../server.js';

export interface ServeInput {
  path: string;
  port: number;
  noOpen: boolean;
}

export interface ServeOk {
  url: string;
  port: number;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // browser open failed; user can copy URL manually
  }
}

export async function serveCommand(input: ServeInput): Promise<Envelope<ServeOk>> {
  const exists = await fs.access(path.join(input.path, '.zettelgeist.yaml')).then(() => true).catch(() => false);
  if (!exists) return errorEnvelope(`not a zettelgeist repo: ${input.path}`);

  let handle: ServerHandle;
  try {
    handle = await startServer({ cwd: input.path, port: input.port });
  } catch (err) {
    return errorEnvelope(`failed to start server: ${(err as Error).message}`);
  }

  console.error(`zettelgeist serving at ${handle.url}`);
  console.error('press Ctrl+C to stop.');

  if (!input.noOpen) {
    openBrowser(handle.url);
  }

  // Keep alive until SIGINT
  await new Promise<void>((resolve) => {
    const stopAndExit = async () => {
      console.error('\nshutting down…');
      await handle.stop();
      resolve();
    };
    process.once('SIGINT', stopAndExit);
    process.once('SIGTERM', stopAndExit);
  });

  return okEnvelope({ url: handle.url, port: handle.port });
}
