import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { makeBackend, type SpecRow, type SpecDetail, type Graph } from './backend.js';
import { BoardView } from './views/board.js';
import { DetailView } from './views/detail.js';
import { GraphView } from './views/graph.js';
import { DocsView } from './views/docs.js';
import { CommandPalette } from './views/palette.js';

export type View = 'board' | 'detail' | 'graph' | 'docs';

export interface AppProps { cwd: string; initialView?: View; }

export function App({ cwd, initialView = 'board' }: AppProps) {
  const backend = React.useMemo(() => makeBackend(cwd), [cwd]);
  const { exit } = useApp();

  const [view, setView] = useState<View>(initialView);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [docs, setDocs] = useState<string[]>([]);
  const [openSpec, setOpenSpec] = useState<SpecDetail | null>(null);
  const [openDoc, setOpenDoc] = useState<{ rel: string; content: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, g, d] = await Promise.all([
          backend.listSpecs(),
          backend.readGraph(),
          backend.listDocs(),
        ]);
        if (cancelled) return;
        setSpecs(s);
        setGraph(g);
        setDocs(d);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [backend]);

  // Global navigation. Gated by `isActive` so the palette is the SOLE
  // input consumer while open — the inner views are also passed
  // `inputDisabled` so their useInput hooks go inert. This is the only
  // place that decides which layer "owns" the keyboard.
  useInput(
    (input, key) => {
      if (input === '?') {
        setPaletteOpen(true);
        return;
      }
      if (input === 'q' || (key.ctrl && input === 'c')) {
        exit();
        return;
      }
      if (key.tab) {
        const order: View[] = ['board', 'detail', 'graph', 'docs'];
        const idx = order.indexOf(view);
        setView(order[(idx + 1) % order.length] ?? 'board');
        return;
      }
      if (input === '1') setView('board');
      if (input === '2') setView('detail');
      if (input === '3') setView('graph');
      if (input === '4') setView('docs');
    },
    { isActive: !paletteOpen },
  );

  if (loading) {
    return <Box><Text color="gray">Loading {cwd}...</Text></Box>;
  }
  if (error !== null) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header view={view} />
      <Box flexDirection="column" marginTop={1}>
        {view === 'board' && (
          <BoardView
            specs={specs}
            inputDisabled={paletteOpen}
            onOpen={async (name) => {
              const d = await backend.readDetail(name);
              setOpenSpec(d);
              setView('detail');
            }}
          />
        )}
        {view === 'detail' && (
          <DetailView
            spec={openSpec}
            specs={specs}
            inputDisabled={paletteOpen}
            onOpen={async (name) => {
              const d = await backend.readDetail(name);
              setOpenSpec(d);
            }}
          />
        )}
        {view === 'graph' && <GraphView graph={graph} />}
        {view === 'docs' && (
          <DocsView
            docs={docs}
            openDoc={openDoc}
            inputDisabled={paletteOpen}
            onOpen={async (rel) => {
              const content = await backend.readDoc(rel);
              setOpenDoc({ rel, content });
            }}
            onClose={() => setOpenDoc(null)}
          />
        )}
      </Box>
      <Footer view={view} />
      {paletteOpen && (
        <CommandPalette
          commands={[
            { id: 'view:board', label: 'View → Board', run: () => setView('board') },
            { id: 'view:detail', label: 'View → Detail', run: () => setView('detail') },
            { id: 'view:graph', label: 'View → Graph', run: () => setView('graph') },
            { id: 'view:docs', label: 'View → Docs', run: () => setView('docs') },
            { id: 'app:quit', label: 'Quit', run: () => exit() },
          ]}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </Box>
  );
}

function Header({ view }: { view: View }) {
  return (
    <Box>
      <Text bold>Zettelgeist TUI</Text>
      <Text dimColor> · </Text>
      <Text color="cyan">{view}</Text>
    </Box>
  );
}

function Footer({ view }: { view: View }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>
        {view === 'board' && '↑↓ select · enter open · 1234 jump view · tab cycle · ? palette · q quit'}
        {view === 'detail' && '↑↓ scroll · 1234 jump view · tab cycle · ? palette · q quit'}
        {view === 'graph' && '1234 jump view · tab cycle · ? palette · q quit'}
        {view === 'docs' && '↑↓ select · enter open · esc close · 1234 jump view · ? palette · q quit'}
      </Text>
    </Box>
  );
}
