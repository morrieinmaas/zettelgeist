import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SpecRow } from '../backend.js';
import type { Status } from '@zettelgeist/core';

const STATUSES: Status[] = [
  'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
];
const STATUS_COLOR: Record<Status, string> = {
  draft: 'gray',
  planned: 'blue',
  'in-progress': 'yellow',
  'in-review': 'cyan',
  done: 'green',
  blocked: 'red',
  cancelled: 'magenta',
};

export interface BoardViewProps {
  specs: SpecRow[];
  onOpen: (name: string) => void;
}

/**
 * Kanban board: one column per status, cards = specs. Vim-style hjkl plus
 * arrow keys for navigation; enter to open a spec.
 */
export function BoardView({ specs, onOpen }: BoardViewProps) {
  const columns: Record<Status, SpecRow[]> = {
    draft: [], planned: [], 'in-progress': [], 'in-review': [],
    done: [], blocked: [], cancelled: [],
  };
  for (const s of specs) columns[s.status].push(s);

  const [col, setCol] = useState(0);
  const [row, setRow] = useState(0);

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setCol((c) => Math.max(0, c - 1));
      setRow(0);
    } else if (key.rightArrow || input === 'l') {
      setCol((c) => Math.min(STATUSES.length - 1, c + 1));
      setRow(0);
    } else if (key.upArrow || input === 'k') {
      setRow((r) => Math.max(0, r - 1));
    } else if (key.downArrow || input === 'j') {
      const curCol = STATUSES[col];
      const max = curCol ? Math.max(0, columns[curCol].length - 1) : 0;
      setRow((r) => Math.min(max, r + 1));
    } else if (key.return) {
      const curCol = STATUSES[col];
      const card = curCol ? columns[curCol][row] : undefined;
      if (card) onOpen(card.name);
    }
  });

  if (specs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No specs yet. Create one with `zettelgeist serve` UI or `mkdir specs/&lt;name&gt; && echo "# foo" &gt; specs/&lt;name&gt;/requirements.md`.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      {STATUSES.map((status, ci) => {
        const cards = columns[status];
        const active = ci === col;
        return (
          <Box key={status} flexDirection="column" marginRight={2} width={16}>
            <Text bold color={STATUS_COLOR[status]}>
              {active ? '▸ ' : '  '}{status} ({cards.length})
            </Text>
            {cards.length === 0 && active ? (
              <Text dimColor>—</Text>
            ) : (
              cards.map((card, ri) => {
                const sel = active && ri === row;
                return (
                  <Box key={card.name}>
                    <Text inverse={sel} wrap="truncate">
                      {card.name}{card.progress !== '0/0' ? ` ${card.progress}` : ''}
                    </Text>
                  </Box>
                );
              })
            )}
          </Box>
        );
      })}
    </Box>
  );
}
