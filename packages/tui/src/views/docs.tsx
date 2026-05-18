import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface DocsViewProps {
  docs: string[];
  openDoc: { rel: string; content: string } | null;
  onOpen: (rel: string) => void;
  onClose: () => void;
  /** When true, the view stops consuming key input (palette is open). */
  inputDisabled?: boolean;
}

export function DocsView({ docs, openDoc, onOpen, onClose, inputDisabled = false }: DocsViewProps) {
  const [selected, setSelected] = useState(0);

  useInput(
    (input, key) => {
      if (openDoc) {
        // Only `esc` closes the open doc. We intentionally don't bind `q`
        // here — `q` quits the app at the global layer and binding it
        // locally too would race with that handler (Ink broadcasts input
        // to every active useInput, so both would fire).
        if (key.escape) onClose();
        return;
      }
      if (key.upArrow || input === 'k') setSelected((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === 'j') setSelected((i) => Math.min(docs.length - 1, i + 1));
      else if (key.return) {
        const target = docs[selected];
        if (target) onOpen(target);
      }
    },
    { isActive: !inputDisabled },
  );

  if (openDoc) {
    return (
      <Box flexDirection="column">
        <Text bold>{openDoc.rel}</Text>
        <Box marginTop={1}>
          <Text>{openDoc.content}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>esc close</Text>
        </Box>
      </Box>
    );
  }

  if (docs.length === 0) {
    return <Text dimColor>(no docs/ directory or no markdown files in it)</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text bold>docs/</Text>
      {docs.map((d, i) => (
        <Text key={d} inverse={i === selected}>  {d}</Text>
      ))}
    </Box>
  );
}
