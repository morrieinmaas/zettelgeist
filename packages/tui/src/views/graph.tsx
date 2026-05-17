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

  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function dfs(node: string): number {
    if (depth.has(node)) return depth.get(node)!;
    if (visiting.has(node)) return 0; // cycle — bail
    visiting.add(node);
    const deps = adj.get(node) ?? [];
    let d = 0;
    for (const dep of deps) d = Math.max(d, dfs(dep) + 1);
    visiting.delete(node);
    depth.set(node, d);
    return d;
  }
  for (const n of graph.nodes) dfs(n.name);

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
