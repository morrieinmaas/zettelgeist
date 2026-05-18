import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SpecRow } from '../backend.js';
import { STATUSES, type Status } from '@zettelgeist/core';

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
  /** When true, the view stops consuming key input (palette is open). */
  inputDisabled?: boolean;
}

/**
 * Kanban board: one column per status, cards = specs. Vim-style hjkl plus
 * arrow keys for navigation; enter to open a spec.
 */
export function BoardView({ specs, onOpen, inputDisabled = false }: BoardViewProps) {
  // Build columns from the canonical 7 statuses. Specs whose status is
  // outside the enum (e.g., a frontmatter override the validator hasn't
  // caught yet) bucket into a sentinel column so the UI never crashes —
  // they're surfaced in a "Misc" column at the end so the user can see +
  // fix them. Better to render junk than crash on bad data.
  const columns: Record<string, SpecRow[]> = {};
  for (const st of STATUSES) columns[st] = [];
  const MISC = '__misc__';
  for (const s of specs) {
    const bucket = (STATUSES as readonly string[]).includes(s.status) ? s.status : MISC;
    if (!columns[bucket]) columns[bucket] = [];
    columns[bucket].push(s);
  }
  const hasMisc = (columns[MISC] ?? []).length > 0;
  const displayed: readonly string[] = hasMisc ? [...STATUSES, MISC] : STATUSES;

  const [col, setCol] = useState(0);
  const [row, setRow] = useState(0);

  useInput((input, key) => {
    if (key.leftArrow || input === 'h') {
      setCol((c) => Math.max(0, c - 1));
      setRow(0);
    } else if (key.rightArrow || input === 'l') {
      setCol((c) => Math.min(displayed.length - 1, c + 1));
      setRow(0);
    } else if (key.upArrow || input === 'k') {
      setRow((r) => Math.max(0, r - 1));
    } else if (key.downArrow || input === 'j') {
      const curCol = displayed[col];
      const max = curCol ? Math.max(0, (columns[curCol] ?? []).length - 1) : 0;
      setRow((r) => Math.min(max, r + 1));
    } else if (key.return) {
      const curCol = displayed[col];
      const card = curCol ? (columns[curCol] ?? [])[row] : undefined;
      if (card) onOpen(card.name);
    }
  }, { isActive: !inputDisabled });

  if (specs.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>
          {'No specs yet. Create one: `mkdir specs/<name> && echo "# foo" > specs/<name>/requirements.md`'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      {displayed.map((status, ci) => {
        const cards = columns[status] ?? [];
        const active = ci === col;
        const color = status === MISC
          ? 'magenta'
          : STATUS_COLOR[status as Status];
        const label = status === MISC ? 'misc' : status;
        return (
          <Box key={status} flexDirection="column" marginRight={2} width={16}>
            <Text bold color={color}>
              {active ? '▸ ' : '  '}{label} ({cards.length})
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
