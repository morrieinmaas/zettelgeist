import React from 'react';
import { Box, Text } from 'ink';
import type { Graph } from '../backend.js';

export interface GraphViewProps {
  graph: Graph | null;
}

/**
 * ASCII-art dependency graph. Layered/topological layout: roots (no
 * outgoing edges = nothing depends on them) at the top; each spec is drawn
 * on the deepest level its dependencies allow. Edges rendered as plain-text
 * arrows below each node.
 *
 * Not a Mermaid replacement — small repos render cleanly; larger ones
 * benefit from the web viewer's Mermaid graph. The TUI graph view's job is
 * to give a quick "what depends on what" overview without leaving the
 * terminal.
 */
export function GraphView({ graph }: GraphViewProps) {
  if (graph === null || graph.nodes.length === 0) {
    return <Text dimColor>(no specs to graph)</Text>;
  }

  // Compute depth of each node via longest-path in the DAG (cycles already
  // reported separately by validate_repo; we treat cycle members as depth 0).
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.name, []);
  for (const e of graph.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }

  // Iterative DFS via an explicit stack. Recursion would blow JS's call
  // stack on graphs with deep dependency chains (~10k frames on V8); the
  // graph is bounded in practice but TUIs running against giant monorepos
  // are exactly where we don't want a crash.
  const depth = new Map<string, number>();
  type Frame = { node: string; childIdx: number; maxChildDepth: number };
  const onStack = new Set<string>();
  for (const root of graph.nodes) {
    if (depth.has(root.name)) continue;
    const stack: Frame[] = [{ node: root.name, childIdx: 0, maxChildDepth: 0 }];
    onStack.add(root.name);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = adj.get(frame.node) ?? [];
      if (frame.childIdx >= children.length) {
        depth.set(frame.node, frame.maxChildDepth);
        onStack.delete(frame.node);
        stack.pop();
        // Bubble the result into the parent's max-child accumulator.
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.maxChildDepth = Math.max(
            parent.maxChildDepth,
            frame.maxChildDepth + 1,
          );
        }
        continue;
      }
      const child = children[frame.childIdx++]!;
      if (depth.has(child)) {
        // Already settled — fold its value in immediately.
        frame.maxChildDepth = Math.max(frame.maxChildDepth, depth.get(child)! + 1);
        continue;
      }
      if (onStack.has(child)) {
        // Cycle. Treat the cycle-touching edge as contributing 0 (matches
        // the old recursive behavior that just bailed).
        continue;
      }
      onStack.add(child);
      stack.push({ node: child, childIdx: 0, maxChildDepth: 0 });
    }
  }

  const byDepth = new Map<number, string[]>();
  for (const [name, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(name);
  }
  for (const arr of byDepth.values()) arr.sort();
  const depths = [...byDepth.keys()].sort((a, b) => b - a); // deepest first (top)

  return (
    <Box flexDirection="column">
      <Text dimColor>↑ depends-on graph (top = consumers, bottom = dependencies) ↓</Text>
      <Box flexDirection="column" marginTop={1}>
        {depths.map((d) => (
          <Box key={d} flexDirection="row">
            <Text dimColor>L{d}: </Text>
            <Text>{(byDepth.get(d) ?? []).join('  ')}</Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Edges (→ depends on):</Text>
        {graph.edges.length === 0 ? (
          <Text dimColor>(no edges)</Text>
        ) : (
          graph.edges.map((e) => (
            <Text key={`${e.from}-${e.to}`}>  {e.from} → {e.to}</Text>
          ))
        )}
      </Box>
      {graph.cycles.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">Cycles:</Text>
          {graph.cycles.map((c, i) => (
            <Text key={i} color="red">  {c.join(' → ')} → {c[0]}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
