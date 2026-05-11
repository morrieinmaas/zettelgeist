import type { DocEntry } from '../backend.js';
import { renderMarkdownEditor } from '../components/markdown-editor.js';
import { showInputModal, showAlert } from '../components/prompt-modal.js';
import { processWikiLinks, makeWikiLinkResolver } from '../util/wiki-links.js';
import { escapeHtml } from '../util/sanitize.js';

export async function renderDocs(params: Record<string, string>): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Loading docs…</p>';

  const backend = window.zettelgeistBackend;
  let entries: DocEntry[];
  let specNames: string[] = [];
  try {
    // Docs + specs in parallel. Specs feed the wiki-link resolver so a
    // `[[user-auth]]` inside a doc body routes to the spec detail view.
    const [docs, specs] = await Promise.all([
      backend.listDocs(),
      backend.listSpecs().catch(() => []),
    ]);
    entries = docs;
    specNames = specs.map((s) => s.name);
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to list docs: ${escapeHtml((err as Error).message)}</p>`;
    return;
  }

  const resolver = makeWikiLinkResolver(specNames, entries.map((e) => e.path));
  const enrich = (root: HTMLElement): void => processWikiLinks(root, resolver);

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
    li.className = 'zg-docs-list-item';

    const link = document.createElement('a');
    link.href = `#/docs/${encodeURIComponent(entry.path)}`;
    link.textContent = entry.title || entry.path;
    if (entry.path === selectedPath) {
      link.classList.add('active');
    }
    li.appendChild(link);

    // Per-entry rename button. Pops a prompt with the current path so the
    // user can edit just the basename or the full path. Refreshes the
    // sidebar + jumps to the new path on success.
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'zg-docs-rename';
    renameBtn.title = 'Rename';
    renameBtn.setAttribute('aria-label', `Rename ${entry.path}`);
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // In-DOM modal — window.prompt() is blocked silently in VSCode webviews,
      // so we never relied on it.
      const next = await showInputModal({
        title: `Rename ${entry.path}`,
        message: 'Path is relative to the workspace root. Use forward slashes for subfolders.',
        defaultValue: entry.path,
        placeholder: 'docs/new-name.md',
        confirmLabel: 'Rename',
        validate: (v) => {
          const t = v.trim();
          if (!t) return 'Path is required.';
          if (t === entry.path) return 'Pick a different path.';
          if (!t.endsWith('.md')) return 'Path must end in .md';
          return null;
        },
      });
      if (next === null) return;  // cancelled
      const trimmed = next.trim();
      try {
        const result = await backend.renameDoc(entry.path, trimmed);
        const wasViewing = entry.path === selectedPath;
        if (wasViewing) {
          window.location.hash = `#/docs/${encodeURIComponent(result.newPath)}`;
        }
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        void showAlert('Rename failed', (err as Error).message);
      }
    });
    li.appendChild(renameBtn);

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
          postRender: enrich,
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
