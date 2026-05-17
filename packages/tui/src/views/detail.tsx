import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SpecDetail, SpecRow } from '../backend.js';

type Tab = 'requirements' | 'tasks' | 'handoff' | 'lenses';
const TABS: Tab[] = ['requirements', 'tasks', 'handoff', 'lenses'];

export interface DetailViewProps {
  spec: SpecDetail | null;
  specs: SpecRow[];
  onOpen: (name: string) => void;
  /** When true, the view stops consuming key input (palette is open). */
  inputDisabled?: boolean;
}

export function DetailView({ spec, specs, onOpen, inputDisabled = false }: DetailViewProps) {
  const [tab, setTab] = useState<Tab>('requirements');
  const [pickerIdx, setPickerIdx] = useState(0);

  useInput(
    (input, key) => {
      if (!spec) {
        if (key.upArrow || input === 'k') setPickerIdx((i) => Math.max(0, i - 1));
        else if (key.downArrow || input === 'j') {
          setPickerIdx((i) => Math.min(specs.length - 1, i + 1));
        } else if (key.return) {
          const target = specs[pickerIdx];
          if (target) onOpen(target.name);
        }
        return;
      }
      if (input === 'h' || key.leftArrow) {
        const idx = TABS.indexOf(tab);
        setTab(TABS[Math.max(0, idx - 1)] ?? tab);
      } else if (input === 'l' || key.rightArrow) {
        const idx = TABS.indexOf(tab);
        setTab(TABS[Math.min(TABS.length - 1, idx + 1)] ?? tab);
      }
    },
    { isActive: !inputDisabled },
  );

  if (!spec) {
    return (
      <Box flexDirection="column">
        <Text bold>No spec selected. Pick one:</Text>
        {specs.length === 0 && <Text dimColor>(empty repo)</Text>}
        {specs.map((s, i) => (
          <Text key={s.name} inverse={i === pickerIdx}>{s.name}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>{spec.name}</Text>
      <Box marginTop={1}>
        {TABS.map((t) => (
          <Box key={t} marginRight={2}>
            <Text bold={t === tab} underline={t === tab} dimColor={t !== tab}>
              {t === 'tasks' && spec.tasks.length > 0
                ? `${t} (${spec.tasks.filter((x) => x.checked).length}/${spec.tasks.length})`
                : t}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {tab === 'requirements' && <Markdown body={spec.requirements ?? '(empty)'} />}
        {tab === 'tasks' && <Tasks tasks={spec.tasks} />}
        {tab === 'handoff' && <Markdown body={spec.handoff ?? '(no handoff)'} />}
        {tab === 'lenses' && <Lenses lenses={spec.lenses} />}
      </Box>
    </Box>
  );
}

function Markdown({ body }: { body: string }) {
  // Pass-through for v0.1; full markdown rendering in TUI would be a separate
  // dep. Headings + code fences are still readable.
  return <Text>{body}</Text>;
}

function Tasks({ tasks }: { tasks: SpecDetail['tasks'] }) {
  if (tasks.length === 0) return <Text dimColor>(no tasks)</Text>;
  return (
    <Box flexDirection="column">
      {tasks.map((t) => (
        <Text key={t.index}>
          [{t.checked ? <Text color="green">x</Text> : ' '}] {t.text}
          {t.tags.length > 0 && <Text dimColor> {t.tags.join(' ')}</Text>}
        </Text>
      ))}
    </Box>
  );
}

function Lenses({ lenses }: { lenses: SpecDetail['lenses'] }) {
  const names = Object.keys(lenses);
  if (names.length === 0) return <Text dimColor>(no lenses)</Text>;
  return (
    <Box flexDirection="column">
      {names.map((n) => (
        <Box key={n} flexDirection="column" marginBottom={1}>
          <Text bold>· {n}</Text>
          <Text>{lenses[n]}</Text>
        </Box>
      ))}
    </Box>
  );
}
