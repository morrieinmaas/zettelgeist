import { loadAllSpecs, scanClaimedSpecs, type FsReader } from './loader.js';
import { parseLogCycles, type LogCycle } from './log.js';
import { loadConfig } from './config.js';
import type { Spec } from './types.js';

/**
 * Pure data layer for `zettelgeist context` and the matching MCP tool.
 * Reads via an FsReader so it's both testable (mem-fs) and reusable from
 * surfaces other than the CLI.
 *
 * GCC-inspired (Wu et al., 2026, arXiv:2508.00031) windowed retrieval —
 * agents pull the slice they need instead of loading whole spec folders.
 */

export interface CycleSummary {
  open: { timestamp: string; agentId: string };
  entries: Array<
    | { kind: 'action'; timestamp: string; agentId: string; action: string }
    | { kind: 'stray'; raw: string }
  >;
  close: { timestamp: string; agentId: string; sha: string } | null;
}

export interface RecentRelease {
  specName: string;
  timestamp: string;
  agentId: string;
  sha: string;
}

export interface StatusEnvelope {
  mode: 'status';
  indexState: string;
  claimed: Array<{ specName: string; agents: string[] }>;
  recentReleases: RecentRelease[];
}

export interface SpecEnvelope {
  mode: 'spec';
  specName: string;
  frontmatter: Record<string, unknown>;
  handoff: string | null;
  mostRecentCycle: CycleSummary | null;
}

export interface LogEnvelope {
  mode: 'log';
  specName: string;
  offset: number;
  totalCycles: number;
  cycle: CycleSummary;
}

export interface MetadataEnvelope {
  mode: 'metadata';
  specName: string;
  frontmatter: Record<string, unknown>;
  key?: string;
  value?: unknown;
}

export type ContextResult =
  | StatusEnvelope
  | SpecEnvelope
  | LogEnvelope
  | MetadataEnvelope;

export interface GatherContextArgs {
  mode: 'status' | 'spec' | 'log' | 'metadata';
  specName?: string;
  offset?: number;
  metadataKey?: string;
}

export function summariseCycle(c: LogCycle): CycleSummary {
  return {
    open: { timestamp: c.open.timestamp, agentId: c.open.agentId },
    entries: c.entries.map((e) =>
      e.kind === 'action'
        ? {
            kind: 'action' as const,
            timestamp: e.timestamp,
            agentId: e.agentId,
            action: e.action,
          }
        : { kind: 'stray' as const, raw: e.raw },
    ),
    close: c.close
      ? { timestamp: c.close.timestamp, agentId: c.close.agentId, sha: c.close.sha }
      : null,
  };
}

async function readLogForSpec(
  reader: FsReader,
  specsDir: string,
  specName: string,
): Promise<LogCycle[]> {
  const p = `${specsDir}/${specName}/.log.md`;
  if (!(await reader.exists(p))) return [];
  const content = await reader.readFile(p);
  return parseLogCycles(content).cycles;
}

async function readHandoff(
  reader: FsReader,
  specsDir: string,
  specName: string,
): Promise<string | null> {
  const p = `${specsDir}/${specName}/handoff.md`;
  if (!(await reader.exists(p))) return null;
  return await reader.readFile(p);
}

async function readIndexAutoRegion(reader: FsReader, specsDir: string): Promise<string> {
  const p = `${specsDir}/INDEX.md`;
  if (!(await reader.exists(p))) return '';
  const content = await reader.readFile(p);
  const marker = '<!-- ZETTELGEIST:AUTO-GENERATED BELOW — do not edit -->';
  const idx = content.indexOf(marker);
  if (idx < 0) return content;
  return content.slice(idx + marker.length).trimStart();
}

async function listAgentsForClaimedSpec(
  reader: FsReader,
  specsDir: string,
  specName: string,
): Promise<string[]> {
  const dir = `${specsDir}/${specName}`;
  if (!(await reader.exists(dir))) return [];
  const entries = await reader.readDir(dir);
  return entries
    .filter((e) => !e.isDir && e.name.startsWith('.claim-'))
    .map((e) => e.name.slice('.claim-'.length))
    .sort();
}

function findSpec(specs: Spec[], name: string): Spec | undefined {
  return specs.find((s) => s.name === name);
}

/**
 * Gather context data per the requested mode. Throws on bad input
 * (unknown spec name, missing required args, etc.) — the CLI / MCP
 * layer wraps these into an envelope or RPC error as appropriate.
 */
export async function gatherContext(
  reader: FsReader,
  args: GatherContextArgs,
): Promise<ContextResult> {
  const cfg = await loadConfig(reader);
  const specsDir = cfg.config.specsDir;

  if (args.mode === 'status') {
    const indexState = await readIndexAutoRegion(reader, specsDir);
    const claimedSet = await scanClaimedSpecs(reader, specsDir);
    const claimed: Array<{ specName: string; agents: string[] }> = [];
    for (const specName of [...claimedSet].sort()) {
      const agents = await listAgentsForClaimedSpec(reader, specsDir, specName);
      claimed.push({ specName, agents });
    }
    const specs = await loadAllSpecs(reader, specsDir);
    const releases: RecentRelease[] = [];
    for (const s of specs) {
      const cycles = await readLogForSpec(reader, specsDir, s.name);
      for (let i = cycles.length - 1; i >= 0; i -= 1) {
        const c = cycles[i]!;
        if (c.close !== null) {
          releases.push({
            specName: s.name,
            timestamp: c.close.timestamp,
            agentId: c.close.agentId,
            sha: c.close.sha,
          });
          break;
        }
      }
    }
    releases.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return {
      mode: 'status',
      indexState,
      claimed,
      recentReleases: releases.slice(0, 3),
    };
  }

  if (args.mode === 'spec') {
    if (!args.specName) throw new Error('--spec requires a spec name');
    const specs = await loadAllSpecs(reader, specsDir);
    const spec = findSpec(specs, args.specName);
    if (!spec) throw new Error(`no spec '${args.specName}'`);
    const handoff = await readHandoff(reader, specsDir, args.specName);
    const cycles = await readLogForSpec(reader, specsDir, args.specName);
    let mostRecent: LogCycle | null = null;
    const open = cycles.find((c) => c.close === null);
    if (open) {
      mostRecent = open;
    } else {
      for (let i = cycles.length - 1; i >= 0; i -= 1) {
        if (cycles[i]!.close !== null) {
          mostRecent = cycles[i]!;
          break;
        }
      }
    }
    return {
      mode: 'spec',
      specName: args.specName,
      frontmatter: spec.frontmatter as Record<string, unknown>,
      handoff,
      mostRecentCycle: mostRecent ? summariseCycle(mostRecent) : null,
    };
  }

  if (args.mode === 'log') {
    if (!args.specName) throw new Error('--log requires a spec name');
    const cycles = await readLogForSpec(reader, specsDir, args.specName);
    if (cycles.length === 0) {
      throw new Error(`no .log.md for spec '${args.specName}' (no agent activity yet)`);
    }
    const newestFirst = [...cycles].reverse();
    const offset = args.offset ?? 0;
    if (offset < 0) throw new Error('--offset must be >= 0');
    if (offset >= newestFirst.length) {
      throw new Error(
        `offset ${offset} exceeds ${newestFirst.length} cycles. ` +
          `Older cycles may have been rotated out — use \`git log ${specsDir}/${args.specName}/.log.md\` to recover.`,
      );
    }
    return {
      mode: 'log',
      specName: args.specName,
      offset,
      totalCycles: cycles.length,
      cycle: summariseCycle(newestFirst[offset]!),
    };
  }

  if (args.mode === 'metadata') {
    if (!args.specName) throw new Error('--metadata requires a spec name');
    const specs = await loadAllSpecs(reader, specsDir);
    const spec = findSpec(specs, args.specName);
    if (!spec) throw new Error(`no spec '${args.specName}'`);
    const frontmatter = spec.frontmatter as Record<string, unknown>;
    if (args.metadataKey) {
      return {
        mode: 'metadata',
        specName: args.specName,
        frontmatter,
        key: args.metadataKey,
        value: frontmatter[args.metadataKey],
      };
    }
    return { mode: 'metadata', specName: args.specName, frontmatter };
  }

  throw new Error(`unknown mode: ${args.mode as string}`);
}
