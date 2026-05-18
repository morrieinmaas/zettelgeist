import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  appendAction,
  appendClaim,
  appendRelease,
  rotateLog,
  DEFAULT_MAX_CYCLES,
  defaultAgentId,
} from '@zettelgeist/core';

/**
 * Per-spec `.log.md` writer. Reads the current file (if any), appends
 * the entry/marker, rotates if over cap, writes back. Returns the
 * repo-relative path so the caller can `git add` it.
 *
 * The .log.md update is performed BEFORE the main commit and the file
 * is staged in the same commit as the action that produced it.
 */
export async function writeLogEntry(args: {
  cwd: string;
  specsDir: string;
  specName: string;
  agentId: string;
  action: string;
}): Promise<{ logRelPath: string }> {
  const { cwd, specsDir, specName, agentId, action } = args;
  const logAbs = path.join(cwd, specsDir, specName, '.log.md');
  let prev = '';
  try {
    prev = await fs.readFile(logAbs, 'utf8');
  } catch {
    /* fresh file */
  }
  const ts = new Date().toISOString();
  let next = appendAction(prev, { timestamp: ts, agentId, action });
  next = rotateLog(next, DEFAULT_MAX_CYCLES);
  await fs.mkdir(path.dirname(logAbs), { recursive: true });
  const tmp = `${logAbs}.tmp`;
  await fs.writeFile(tmp, next, 'utf8');
  await fs.rename(tmp, logAbs);
  return { logRelPath: path.posix.join(specsDir, specName, '.log.md') };
}

export async function writeCycleMarker(args: {
  cwd: string;
  specsDir: string;
  specName: string;
  agentId: string;
  kind: 'claim' | 'release';
  sha?: string;
}): Promise<{ logRelPath: string }> {
  const { cwd, specsDir, specName, agentId, kind } = args;
  const logAbs = path.join(cwd, specsDir, specName, '.log.md');
  let prev = '';
  try {
    prev = await fs.readFile(logAbs, 'utf8');
  } catch {
    /* fresh file */
  }
  const ts = new Date().toISOString();
  let next: string;
  if (kind === 'claim') {
    next = appendClaim(prev, { timestamp: ts, agentId });
  } else {
    if (!args.sha) throw new Error('writeCycleMarker: release requires a sha');
    next = appendRelease(prev, { timestamp: ts, agentId, sha: args.sha });
  }
  // Rotation runs on release (when the cycle just completed). Claims
  // never trigger rotation because the new cycle is in-progress and is
  // never the oldest cycle.
  if (kind === 'release') next = rotateLog(next, DEFAULT_MAX_CYCLES);
  await fs.mkdir(path.dirname(logAbs), { recursive: true });
  const tmp = `${logAbs}.tmp`;
  await fs.writeFile(tmp, next, 'utf8');
  await fs.rename(tmp, logAbs);
  return { logRelPath: path.posix.join(specsDir, specName, '.log.md') };
}

/**
 * Heuristic agent-id resolution for write tools that don't take an
 * explicit `agent_id` parameter. Scans the spec folder for `.claim-<id>`
 * files (any active claim attributes the action to that agent) and falls
 * back to `defaultAgentId()` if none is present.
 *
 * Multi-claim case (rare): picks the most recently modified claim file.
 */
export async function resolveAgentId(args: {
  cwd: string;
  specsDir: string;
  specName: string;
}): Promise<string> {
  const dir = path.join(args.cwd, args.specsDir, args.specName);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return defaultAgentId();
  }
  const claims = entries.filter((n) => n.startsWith('.claim-'));
  if (claims.length === 0) return defaultAgentId();
  if (claims.length === 1) return claims[0]!.slice('.claim-'.length);
  // Multiple — pick most recently modified.
  const stats = await Promise.all(
    claims.map(async (n) => ({ name: n, m: (await fs.stat(path.join(dir, n))).mtimeMs })),
  );
  stats.sort((a, b) => b.m - a.m);
  return stats[0]!.name.slice('.claim-'.length);
}
