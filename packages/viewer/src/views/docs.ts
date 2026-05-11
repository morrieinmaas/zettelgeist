import type { DocEntry } from '../backend.js';
import { sanitizeHtml, escapeHtml } from '../util/sanitize.js';

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

  // If no doc is explicitly selected, default to a sensible first one rather
  // than a blank "Pick a document" pane. Preference order:
  //   1. docs/README.md (if it exists)
  //   2. docs/architecture.md (common convention)
  //   3. docs/onboarding.md
  //   4. the alphabetically first doc
  // This keeps `#/docs` navigable without an extra click.
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
  if (entries.length === 0) {
    const empty = document.createElement('li');
    empty.innerHTML = '<em>No docs found.</em>';
    list.appendChild(empty);
  }
  sidebar.appendChild(list);

  const main = document.createElement('article');
  main.className = 'zg-docs-main';

  if (selectedPath) {
    try {
      const doc = await backend.readDoc(selectedPath);
      const heading = document.createElement('h2');
      heading.textContent = doc.metadata.title || selectedPath;
      const body = document.createElement('div');
      body.className = 'zg-markdown';
      body.innerHTML = sanitizeHtml(doc.rendered);
      main.appendChild(heading);
      main.appendChild(body);
    } catch (err) {
      main.innerHTML = `<p class="zg-error">Failed to read doc: ${escapeHtml((err as Error).message)}</p>`;
    }
  } else {
    // Empty state — only reachable when there are zero docs in the repo.
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
