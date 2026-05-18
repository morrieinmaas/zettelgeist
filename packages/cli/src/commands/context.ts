import {
  gatherContext,
  type ContextResult,
  type CycleSummary,
  type MetadataEnvelope,
} from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist context [<mode>]

  Windowed retrieval over the Zettelgeist repo's structured memory.
  Inspired by GCC's CONTEXT command (Wu et al., 2026, arXiv:2508.00031).
  Lets agents fetch only the slice they need instead of reading whole
  spec folders raw.

  Modes:
    (no args)              Project status: INDEX state, currently-claimed
                           specs, last 3 cycle-release markers across all
                           specs.
    --spec <name>          That spec's frontmatter + handoff.md + the
                           most recent completed cycle from .log.md (K=1).
    --log <name>           Most recent completed cycle from
                           specs/<name>/.log.md. If a cycle is open,
                           return that instead. Combine with --offset N
                           to scroll back N cycles.
    --offset <N>           Used with --log to scroll. 0 = current/most
                           recent (default). N past the available count
                           exits non-zero with a hint to use
                           \`git log specs/<name>/.log.md\`.
    --metadata <name>      Full frontmatter for a spec.
    --metadata <name> <key>
                           A single frontmatter value (e.g. status,
                           blocked_by, depends_on). Avoids loading the
                           whole requirements.md when an agent just
                           needs one field.

  Global flags:
    --json                 Emit the structured envelope on stdout.

  All retrieval is local; no network. \`--log <name>\` reads the current
  .log.md only — older rotated cycles can be recovered with
  \`git log specs/<name>/.log.md\`.
`;

export interface ContextInput {
  cwd: string;
  mode: 'status' | 'spec' | 'log' | 'metadata';
  specName?: string | undefined;
  offset?: number | undefined;
  metadataKey?: string | undefined;
}

export type { ContextResult } from '@zettelgeist/core';

export async function contextCommand(input: ContextInput): Promise<Envelope<ContextResult>> {
  const reader = makeDiskFsReader(input.cwd);
  try {
    const data = await gatherContext(reader, {
      mode: input.mode,
      ...(input.specName !== undefined ? { specName: input.specName } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
      ...(input.metadataKey !== undefined ? { metadataKey: input.metadataKey } : {}),
    });
    return okEnvelope<ContextResult>(data);
  } catch (err) {
    return errorEnvelope(`context: ${(err as Error).message}`);
  }
}

/**
 * Render the envelope as a compact, human-readable text block. The JSON
 * envelope is always available via `--json` for programmatic consumers.
 */
export function formatContext(data: ContextResult): string {
  if (data.mode === 'status') {
    const lines = ['# Project status', ''];
    if (data.claimed.length === 0) {
      lines.push('No specs currently claimed.');
    } else {
      lines.push('## Claimed');
      for (const c of data.claimed) {
        lines.push(`  ${c.specName}: ${c.agents.join(', ')}`);
      }
    }
    lines.push('', '## Last 3 cycle releases');
    if (data.recentReleases.length === 0) {
      lines.push('  (no cycle activity yet)');
    } else {
      for (const r of data.recentReleases) {
        lines.push(`  ${r.timestamp}  ${r.specName}  agent=${r.agentId}  sha=${r.sha}`);
      }
    }
    lines.push('', '## INDEX state', data.indexState.trimEnd());
    return lines.join('\n');
  }
  if (data.mode === 'spec') {
    const lines = [`# ${data.specName}`, ''];
    lines.push('## Frontmatter');
    for (const [k, v] of Object.entries(data.frontmatter)) {
      lines.push(`  ${k}: ${JSON.stringify(v)}`);
    }
    lines.push('', '## Handoff');
    lines.push(data.handoff?.trimEnd() ?? '(no handoff.md)');
    lines.push('', '## Most recent cycle');
    if (!data.mostRecentCycle) {
      lines.push('  (no cycle activity yet)');
    } else {
      lines.push(renderCycle(data.mostRecentCycle));
    }
    return lines.join('\n');
  }
  if (data.mode === 'log') {
    return [
      `# ${data.specName} · log offset ${data.offset} of ${data.totalCycles}`,
      '',
      renderCycle(data.cycle),
    ].join('\n');
  }
  // metadata mode
  const md: MetadataEnvelope = data;
  if (md.key !== undefined) {
    return `${md.specName}.${md.key} = ${JSON.stringify(md.value)}`;
  }
  const lines = [`# ${md.specName} metadata`];
  for (const [k, v] of Object.entries(md.frontmatter)) {
    lines.push(`  ${k}: ${JSON.stringify(v)}`);
  }
  return lines.join('\n');
}

function renderCycle(c: CycleSummary): string {
  const lines: string[] = [];
  lines.push(`  ⊢ ${c.open.timestamp}  agent=${c.open.agentId}  claim`);
  for (const e of c.entries) {
    if (e.kind === 'action') {
      lines.push(`    - ${e.timestamp}  agent=${e.agentId}  ${e.action}`);
    } else {
      lines.push(`    ${e.raw}`);
    }
  }
  if (c.close) {
    lines.push(`  ⊣ ${c.close.timestamp}  agent=${c.close.agentId}  release  sha=${c.close.sha}`);
  } else {
    lines.push('  ⊣ (in progress — no release yet)');
  }
  return lines.join('\n');
}
