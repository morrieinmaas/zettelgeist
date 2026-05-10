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

  const selectedPath = params.path ? decodeURIComponent(params.path) : null;

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
    const intro = document.createElement('div');
    intro.innerHTML = '<h2>Docs</h2><p>Pick a document from the sidebar.</p>';
    main.appendChild(intro);
  }

  wrapper.appendChild(sidebar);
  wrapper.appendChild(main);
  app.appendChild(wrapper);
}
