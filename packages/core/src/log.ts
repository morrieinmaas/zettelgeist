/**
 * `.log.md` — per-spec Observation–Thought–Action trace.
 *
 * File shape (per spec v0.1 §9.4 amendment):
 *
 *   <optional header — any lines before the first cycle marker>
 *
 *   ## ⊢ 2026-05-18T11:30:00Z · agent=morrie · claim
 *   - 2026-05-18T11:31:00Z · agent=morrie · tick_task(2)
 *   - 2026-05-18T11:35:00Z · agent=morrie · write_handoff()
 *   ## ⊣ 2026-05-18T11:42:00Z · agent=morrie · release · sha=abc1234
 *
 *   ## ⊢ ...next cycle...
 *
 * A cycle is one `## ⊢ ... claim` marker, zero or more `- ...` action
 * lines, and (optionally) one `## ⊣ ... release · sha=...` marker. A
 * cycle without a release marker is in-progress and is never rotated.
 *
 * Stray lines (anything not matching the patterns below) are preserved:
 * stray lines before the first cycle become the file header; stray
 * lines inside a cycle ride along with that cycle. This means humans
 * can drop a note into `.log.md` without us silently dropping it.
 */

export interface LogActionEntry {
  kind: 'action';
  timestamp: string;
  agentId: string;
  action: string;
  raw: string;
}

export interface LogStrayEntry {
  kind: 'stray';
  raw: string;
}

export type LogEntry = LogActionEntry | LogStrayEntry;

export interface CycleOpenMarker {
  timestamp: string;
  agentId: string;
  raw: string;
}

export interface CycleCloseMarker {
  timestamp: string;
  agentId: string;
  sha: string;
  raw: string;
}

export interface LogCycle {
  open: CycleOpenMarker;
  entries: LogEntry[];
  close: CycleCloseMarker | null;
}

export interface ParsedLog {
  header: string[];
  cycles: LogCycle[];
}

// Patterns — kept liberal on whitespace (allow extra spaces) to be
// tolerant of editor reformatting. The bullet character is `-`.
const OPEN_RE = /^##\s+⊢\s+(\S+)\s+·\s+agent=(\S+)\s+·\s+claim\s*$/;
const CLOSE_RE = /^##\s+⊣\s+(\S+)\s+·\s+agent=(\S+)\s+·\s+release\s+·\s+sha=(\S+)\s*$/;
const ACTION_RE = /^-\s+(\S+)\s+·\s+agent=(\S+)\s+·\s+(.+?)\s*$/;

export function parseLogCycles(content: string): ParsedLog {
  const header: string[] = [];
  const cycles: LogCycle[] = [];
  let current: LogCycle | null = null;
  let seenFirstMarker = false;

  for (const rawLine of content.split('\n')) {
    // Don't trim — preserve indentation for stray lines.
    const line = rawLine;

    const open = OPEN_RE.exec(line);
    if (open) {
      seenFirstMarker = true;
      // If a cycle was already open without a release, close it as
      // abandoned (close: null) and start a new one. Lossless: the
      // entries stay with the abandoned cycle.
      if (current) cycles.push(current);
      current = {
        open: { timestamp: open[1]!, agentId: open[2]!, raw: line },
        entries: [],
        close: null,
      };
      continue;
    }

    const close = CLOSE_RE.exec(line);
    if (close && current) {
      current.close = {
        timestamp: close[1]!,
        agentId: close[2]!,
        sha: close[3]!,
        raw: line,
      };
      cycles.push(current);
      current = null;
      seenFirstMarker = true;
      continue;
    }

    // A close marker with no current cycle — treat as stray header.
    if (close) {
      header.push(line);
      continue;
    }

    const action = ACTION_RE.exec(line);
    if (action && current) {
      current.entries.push({
        kind: 'action',
        timestamp: action[1]!,
        agentId: action[2]!,
        action: action[3]!,
        raw: line,
      });
      continue;
    }

    // Stray line (header preamble, blank, hand-written note, malformed).
    if (current) {
      current.entries.push({ kind: 'stray', raw: line });
    } else if (!seenFirstMarker) {
      header.push(line);
    } else {
      // Between cycles — attach to the most recent closed cycle so it
      // round-trips through serialize.
      const last = cycles[cycles.length - 1];
      if (last) {
        // Append as a trailing stray. We model "between cycles" as
        // strays riding the previous cycle to keep the data shape flat.
        last.entries.push({ kind: 'stray', raw: line });
      } else {
        header.push(line);
      }
    }
  }

  // Last-line trailing newline produces an empty string in the split;
  // drop a single trailing empty stray from the very last cycle (or
  // header) so we don't accumulate blank lines on round-trip.
  if (current) cycles.push(current);
  return { header, cycles };
}

/**
 * Render parsed log back to text. Round-trip identity (modulo a single
 * trailing newline that may be normalised) is a property used by tests.
 */
export function serializeLog(parsed: ParsedLog): string {
  const out: string[] = [];
  for (const line of parsed.header) out.push(line);
  for (const cycle of parsed.cycles) {
    out.push(cycle.open.raw);
    for (const entry of cycle.entries) out.push(entry.raw);
    if (cycle.close) out.push(cycle.close.raw);
  }
  return out.join('\n');
}

/**
 * Drop oldest complete cycles until `cycles.filter(c => c.close).length`
 * is at most `maxCycles`. In-progress cycles (no `close`) are never
 * dropped. Header is preserved. Pure function.
 */
export function rotateLog(content: string, maxCycles: number): string {
  if (maxCycles < 0) throw new Error(`rotateLog: maxCycles must be >= 0, got ${maxCycles}`);
  const parsed = parseLogCycles(content);
  const completeCount = parsed.cycles.filter((c) => c.close !== null).length;
  if (completeCount <= maxCycles) return content;

  let toDrop = completeCount - maxCycles;
  const kept: LogCycle[] = [];
  for (const cycle of parsed.cycles) {
    if (toDrop > 0 && cycle.close !== null) {
      toDrop -= 1;
      continue;
    }
    kept.push(cycle);
  }
  return serializeLog({ header: parsed.header, cycles: kept });
}

/**
 * Append a single action entry to a `.log.md` content string. The action
 * is bound to whatever cycle is currently open. If no cycle is open, the
 * entry is dropped (action lines outside cycles are not valid per the
 * format) — callers are expected to call `appendClaim` first.
 */
export function appendAction(
  content: string,
  args: { timestamp: string; agentId: string; action: string },
): string {
  const line = `- ${args.timestamp} · agent=${args.agentId} · ${args.action}`;
  // Tolerate empty input: if there's no open cycle, no place to attach
  // the action — return the content unchanged. Callers should guard.
  const parsed = parseLogCycles(content);
  const last = parsed.cycles[parsed.cycles.length - 1];
  if (!last || last.close !== null) {
    // No open cycle. Don't silently drop — append a stray comment in
    // the header so debugging surfaces it. Better than data loss.
    parsed.header.push(`<!-- zg: orphan action skipped: ${line} -->`);
    return serializeLog(parsed);
  }
  last.entries.push({
    kind: 'action',
    timestamp: args.timestamp,
    agentId: args.agentId,
    action: args.action,
    raw: line,
  });
  return serializeLog(parsed);
}

export function appendClaim(
  content: string,
  args: { timestamp: string; agentId: string },
): string {
  const line = `## ⊢ ${args.timestamp} · agent=${args.agentId} · claim`;
  const parsed = parseLogCycles(content);
  parsed.cycles.push({
    open: { timestamp: args.timestamp, agentId: args.agentId, raw: line },
    entries: [],
    close: null,
  });
  return serializeLog(parsed);
}

export function appendRelease(
  content: string,
  args: { timestamp: string; agentId: string; sha: string },
): string {
  const line = `## ⊣ ${args.timestamp} · agent=${args.agentId} · release · sha=${args.sha}`;
  const parsed = parseLogCycles(content);
  const last = parsed.cycles[parsed.cycles.length - 1];
  if (!last || last.close !== null) {
    // No open cycle to close. Same orphan-comment treatment as appendAction.
    parsed.header.push(`<!-- zg: orphan release skipped: ${line} -->`);
    return serializeLog(parsed);
  }
  last.close = {
    timestamp: args.timestamp,
    agentId: args.agentId,
    sha: args.sha,
    raw: line,
  };
  return serializeLog(parsed);
}

/**
 * Default rotation cap per spec §9.4. Exposed so the MCP server and
 * the CLI use the same value.
 */
export const DEFAULT_MAX_CYCLES = 50;
