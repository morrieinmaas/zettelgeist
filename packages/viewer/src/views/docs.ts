import type { DocEntry } from '../backend.js';
import { renderMarkdownEditor } from '../components/markdown-editor.js';
import { escapeHtml } from '../util/sanitize.js';

export async function renderDocs(params: Record<string, string>): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Loading docs…</p>';

  const backend = window.zettelgeistBackend;
  let entries: DocEntry[];
  try {
    entries = await backend.listDocs();
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to list docs: ${escapeHtml((err as Error).message)}</p>`;
    return;
  }

  // Default-doc selection: README → architecture → onboarding → alphabetical
  // first. Keeps `#/docs` from landing on a blank pane.
  let selectedPath = params.path ? decodeURIComponent(params.path) : null;
  if (!selectedPath && entries.length > 0) {
    const preferences = ['docs/README.md', 'docs/readme.md', 'docs/architecture.md', 'docs/onboarding.md'];
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
    selectedPath =
      preferences.find((p) => entries.some((e) => e.path === p))
      ?? sorted[0]!.path;
  }

  app.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'zg-docs';

  const sidebar = document.createElement('aside');
  sidebar.className = 'zg-docs-sidebar';
  const title = document.createElement('h3');
  title.textContent = 'Docs';
  sidebar.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'zg-docs-list';
  for (const entry of entries) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#/docs/${encodeURIComponent(entry.path)}`;
    link.textContent = entry.title || entry.path;
    if (entry.path === selectedPath) {
      link.classList.add('active');
    }
    li.appendChild(link);
    list.appendChild(li);
  }
  sidebar.appendChild(list);

  const main = document.createElement('article');
  main.className = 'zg-docs-main';

  if (selectedPath) {
    try {
      const doc = await backend.readDoc(selectedPath);
      // No auto-heading here. The doc's own H1 IS the title — adding our
      // own would render it twice. If the doc lacks an H1, the sidebar link
      // already shows the file name as a fallback.
      main.appendChild(
        renderMarkdownEditor({
          body: doc.source,
          emptyPlaceholder: `${selectedPath} is empty`,
          emptyHint: 'Click below to start writing.',
          interactiveCheckboxes: true,
          onSave: async (newBody) => {
            await backend.writeDoc(selectedPath!, newBody);
          },
        }),
      );
    } catch (err) {
      main.innerHTML = `<p class="zg-error">Failed to read doc: ${escapeHtml((err as Error).message)}</p>`;
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'zg-empty-state';
    const h = document.createElement('h3');
    h.textContent = 'No docs yet';
    empty.appendChild(h);
    const p = document.createElement('p');
    p.textContent =
      'Add narrative documentation as markdown files under a `docs/` folder at ' +
      'the repo root. Anything there shows up here.';
    empty.appendChild(p);
    main.appendChild(empty);
  }

  wrapper.appendChild(sidebar);
  wrapper.appendChild(main);
  app.appendChild(wrapper);
}
