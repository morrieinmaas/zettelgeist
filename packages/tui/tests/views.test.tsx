import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { render } from 'ink-testing-library';
import { BoardView } from '../src/views/board.js';
import { DetailView } from '../src/views/detail.js';
import { GraphView } from '../src/views/graph.js';
import { DocsView } from '../src/views/docs.js';
import { CommandPalette } from '../src/views/palette.js';
import { makeBackend } from '../src/backend.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zg-tui-test-'));
  await fs.writeFile(path.join(tmp, '.zettelgeist.yaml'), 'format_version: "0.2"\n');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('BoardView', () => {
  it('renders all 7 status columns when specs are present', () => {
    const { lastFrame } = render(
      <BoardView
        specs={[
          { name: 'a', status: 'draft', progress: '0/0', blockedBy: null },
        ]}
        onOpen={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('draft');
    expect(out).toContain('planned');
    expect(out).toMatch(/in-progress/);
    expect(out).toMatch(/in-review/);
    expect(out).toContain('done');
    expect(out).toContain('blocked');
    expect(out).toContain('cancelled');
  });

  it('places specs into their status columns and renders the cards', () => {
    const { lastFrame } = render(
      <BoardView
        specs={[
          { name: 'alpha', status: 'in-progress', progress: '1/3', blockedBy: null },
          { name: 'beta', status: 'in-progress', progress: '0/2', blockedBy: null },
          { name: 'gamma', status: 'done', progress: '5/5', blockedBy: null },
        ]}
        onOpen={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    // Counts may wrap inside the 16-char-wide column — match the digit standalone.
    expect(out).toMatch(/in-progress[\s\S]*?\(?2\)?/);
    expect(out).toMatch(/done[\s\S]*?\(?1\)?/);
    expect(out).toContain('alpha');
    expect(out).toContain('gamma');
  });

  it('shows an empty-state hint when there are no specs', () => {
    const { lastFrame } = render(
      <BoardView specs={[]} onOpen={() => undefined} />,
    );
    expect(lastFrame() ?? '').toContain('No specs yet');
  });
});

describe('DetailView', () => {
  it('shows the spec picker when no spec is open', () => {
    const { lastFrame } = render(
      <DetailView
        spec={null}
        specs={[
          { name: 'alpha', status: 'draft', progress: '0/0', blockedBy: null },
          { name: 'beta', status: 'planned', progress: '0/1', blockedBy: null },
        ]}
        onOpen={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('No spec selected');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
  });

  it('renders the tabs and selected requirements body', () => {
    const { lastFrame } = render(
      <DetailView
        spec={{
          name: 'alpha',
          frontmatter: {},
          requirements: '# Alpha\n\nDoc body here.\n',
          tasks: [
            { index: 1, checked: false, text: 'task one', tags: [] },
            { index: 2, checked: true, text: 'task two', tags: [] },
          ],
          handoff: null,
          lenses: {},
        }}
        specs={[]}
        onOpen={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('alpha');
    expect(out).toContain('requirements');
    expect(out).toContain('tasks (1/2)');
    expect(out).toContain('Doc body here');
  });
});

describe('GraphView', () => {
  it('renders empty state when no specs', () => {
    const { lastFrame } = render(<GraphView graph={null} />);
    expect(lastFrame() ?? '').toContain('no specs');
  });

  it('renders nodes and edges', () => {
    const { lastFrame } = render(
      <GraphView
        graph={{
          nodes: [
            { name: 'core', partOf: null },
            { name: 'api', partOf: null },
            { name: 'ui', partOf: null },
          ],
          edges: [
            { from: 'api', to: 'core' },
            { from: 'ui', to: 'api' },
          ],
          blocks: [],
          cycles: [],
        }}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('core');
    expect(out).toContain('api');
    expect(out).toContain('ui');
    expect(out).toContain('api → core');
    expect(out).toContain('ui → api');
  });

  it('flags cycles in red', () => {
    const { lastFrame } = render(
      <GraphView
        graph={{
          nodes: [
            { name: 'a', partOf: null },
            { name: 'b', partOf: null },
          ],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
          ],
          blocks: [],
          cycles: [['a', 'b']],
        }}
      />,
    );
    expect(lastFrame() ?? '').toContain('Cycles');
  });
});

describe('DocsView', () => {
  it('renders the doc list', () => {
    const { lastFrame } = render(
      <DocsView
        docs={['guide.md', 'architecture.md']}
        openDoc={null}
        onOpen={() => undefined}
        onClose={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('guide.md');
    expect(out).toContain('architecture.md');
  });

  it('renders the opened doc body', () => {
    const { lastFrame } = render(
      <DocsView
        docs={['guide.md']}
        openDoc={{ rel: 'guide.md', content: '# Guide\n\nHello.\n' }}
        onOpen={() => undefined}
        onClose={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('guide.md');
    expect(out).toContain('# Guide');
    expect(out).toContain('Hello');
  });
});

describe('CommandPalette', () => {
  it('renders the command list with a prompt', () => {
    const { lastFrame } = render(
      <CommandPalette
        commands={[
          { id: 'foo', label: 'Do foo', run: () => undefined },
          { id: 'bar', label: 'Do bar', run: () => undefined },
        ]}
        onClose={() => undefined}
      />,
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('Command palette');
    expect(out).toContain('Do foo');
    expect(out).toContain('Do bar');
  });
});

describe('backend.makeBackend (integration with @zettelgeist/core)', () => {
  it('listSpecs returns derived state from disk', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'alpha'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'alpha', 'requirements.md'), '---\nstatus: in-progress\n---\n# alpha\n');
    await fs.writeFile(path.join(tmp, 'specs', 'alpha', 'tasks.md'), '- [x] one\n- [ ] two\n');

    const b = makeBackend(tmp);
    const rows = await b.listSpecs();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('alpha');
    expect(rows[0]?.status).toBe('in-progress');
    expect(rows[0]?.progress).toBe('1/2');
  });

  it('readDetail returns full bundle', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'foo'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'requirements.md'), '# foo\n');
    await fs.writeFile(path.join(tmp, 'specs', 'foo', 'handoff.md'), '# handoff\n');

    const b = makeBackend(tmp);
    const d = await b.readDetail('foo');
    expect(d).not.toBeNull();
    expect(d?.requirements).toContain('# foo');
    expect(d?.handoff).toContain('# handoff');
  });

  it('readGraph returns the dep graph', async () => {
    await fs.mkdir(path.join(tmp, 'specs', 'alpha'), { recursive: true });
    await fs.mkdir(path.join(tmp, 'specs', 'beta'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'specs', 'alpha', 'requirements.md'), '---\ndepends_on: [beta]\n---\n# alpha\n');
    await fs.writeFile(path.join(tmp, 'specs', 'beta', 'requirements.md'), '# beta\n');

    const b = makeBackend(tmp);
    const g = await b.readGraph();
    expect(g.edges).toEqual([{ from: 'alpha', to: 'beta' }]);
  });

  it('listDocs returns markdown files under docs/ (empty when absent)', async () => {
    const b = makeBackend(tmp);
    expect(await b.listDocs()).toEqual([]);
    await fs.mkdir(path.join(tmp, 'docs'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'docs', 'a.md'), '# a');
    await fs.writeFile(path.join(tmp, 'docs', 'b.md'), '# b');
    const docs = await b.listDocs();
    expect(docs).toEqual(['a.md', 'b.md']);
  });
});
