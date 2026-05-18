import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface Command {
  id: string;
  label: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.return) {
      const c = filtered[idx];
      if (c) {
        onClose();
        c.run();
      }
      return;
    }
    if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
    else if (key.downArrow) setIdx((i) => Math.min(filtered.length - 1, i + 1));
    else if (key.backspace || key.delete) {
      // Backspace on an empty query closes the palette (same affordance
      // as Spotlight / VS Code) — otherwise the only way out is `esc`
      // which is non-obvious for users coming from those tools.
      if (query.length === 0) onClose();
      else setQuery((q) => q.slice(0, -1));
    }
    else if (input && !key.ctrl && !key.meta && input.length === 1) {
      setQuery((q) => q + input);
      setIdx(0);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
      <Text bold>Command palette</Text>
      <Box>
        <Text dimColor>{'> '}</Text>
        <Text>{query}</Text>
        <Text dimColor>{filtered.length === 0 ? ' (no matches — esc to close)' : ''}</Text>
      </Box>
      {filtered.slice(0, 8).map((c, i) => (
        <Text key={c.id} inverse={i === idx}>  {c.label}</Text>
      ))}
    </Box>
  );
}
