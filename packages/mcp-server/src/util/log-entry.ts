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
 * the entry/marker, rotates if over cap, writes back. Returns
 * `{ logRelPath, wrote }` — `wrote: false` means the helper short-
 * circuited and there's nothing for the caller to `git add`.
 *
 * The .log.md update is performed BEFORE the main commit and the file
 * is staged in the same commit as the action that produced it.
 *
 * Orphan-action short-circuit: if there's no `.log.md` yet AND there's
 * no open cycle (i.e. caller is appending an action without a prior
 * `claim_spec`), we skip the write entirely. Without this, every misuse
 * would create a `.log.md` containing only orphan-comment lines plus a
 * git commit per call — pollution with no usable signal. When `.log.md`
 * already exists (an open cycle could be lurking or a header is
 * present), we proceed normally and the parser's orphan-comment
 * handling preserves the data.
 */
export async function writeLogEntry(args: {
  cwd: string;
  specsDir: string;
  specName: string;
  agentId: string;
  action: string;
}): Promise<{ logRelPath: string; wrote: boolean }> {
  const { cwd, specsDir, specName, agentId, action } = args;
  const logAbs = path.join(cwd, specsDir, specName, '.log.md');
  let prev = '';
  let exists = true;
  try {
    prev = await fs.readFile(logAbs, 'utf8');
  } catch {
    exists = false;
  }
  const ts = new Date().toISOString();
  const logRelPath = path.posix.join(specsDir, specName, '.log.md');

  // Orphan short-circuit: don't create a fresh .log.md just to record
  // an action that has no cycle to attach to. The agent isn't following
  // the claim→action→release protocol; we shouldn't materialise garbage.
  if (!exists) {
    return { logRelPath, wrote: false };
  }

  let next = appendAction(prev, { timestamp: ts, agentId, action });
  next = rotateLog(next, DEFAULT_MAX_CYCLES);
  if (next === prev) {
    // No-op write (e.g. action discarded because the parser couldn't
    // attach it). Nothing to stage.
    return { logRelPath, wrote: false };
  }
  await fs.mkdir(path.dirname(logAbs), { recursive: true });
  const tmp = `${logAbs}.tmp`;
  await fs.writeFile(tmp, next, 'utf8');
  await fs.rename(tmp, logAbs);
  return { logRelPath, wrote: true };
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
 * back to `defaultAgentId()` (USER-pid of the MCP SERVER process) if
 * none is present.
 *
 * **Attribution caveats agents/operators should know:**
 *
 * - The fallback identity is the MCP server's process identity, NOT the
 *   originating request's client identity. Anonymous actions from the
 *   same server process all attribute to the same synthetic `USER-pid`
 *   slug.
 *
 * - Multi-claim case (rare): picks the most recently modified claim
 *   file by mtime. On filesystems with 1-second mtime resolution
 *   (HFS+, some networked stores) two near-simultaneous claims may tie;
 *   the tiebreak then falls to readdir order, which is unspecified.
 *
 * - The right way to get deterministic attribution is to pass an
 *   explicit `agentId` to `writeLogEntry` / `writeCycleMarker` from the
 *   tool handler. The MCP `claim_spec` / `release_spec` tools already
 *   take `agent_id` as input; other write tools currently rely on this
 *   heuristic. Future versions may thread `agent_id` through every
 *   write tool's input schema.
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
