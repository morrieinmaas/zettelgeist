import { marked } from 'marked';
import { sanitizeHtml, escapeHtml } from '../util/sanitize.js';

// GFM is the default in marked v10+ but we set it explicitly so task-list
// items (`- [ ] foo` / `- [x] foo`) render as <input type="checkbox"> rather
// than plain bullets. The Tasks tab handles interactive editing; markdown
// bodies (requirements / handoff / lenses) get the visual representation.
marked.setOptions({ gfm: true });

export interface MarkdownEditorOptions {
  /** The current markdown body (no frontmatter). Pre-fills the textarea. */
  body: string | null;
  /** Placeholder shown when body is null/empty in view mode. */
  emptyPlaceholder: string;
  /** Save handler — receives the new body string. Throws → error displayed. */
  onSave: (newBody: string) => Promise<void>;
}

/**
 * Wraps a markdown body with view/edit toggle. View mode shows the rendered,
 * sanitized HTML with an Edit button. Edit mode shows a textarea + Save/Cancel.
 * On successful save, re-renders the new body in view mode without a route
 * refresh.
 */
export function renderMarkdownEditor(opts: MarkdownEditorOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zg-md-editor';

  let currentBody = opts.body ?? '';
  let mode: 'view' | 'edit' = 'view';

  function render(): void {
    container.innerHTML = '';
    if (mode === 'view') {
      container.appendChild(viewMode());
    } else {
      container.appendChild(editMode());
    }
  }

  function viewMode(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'zg-md-view';

    const body = document.createElement('div');
    body.className = 'zg-markdown';
    if (currentBody.trim()) {
      body.innerHTML = sanitizeHtml(marked.parse(currentBody) as string);
    } else {
      const em = document.createElement('p');
      em.innerHTML = `<em>${escapeHtml(opts.emptyPlaceholder)}</em>`;
      body.appendChild(em);
    }
    wrap.appendChild(body);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'zg-md-edit-btn';
    editBtn.textContent = '✎ Edit';
    editBtn.addEventListener('click', () => {
      mode = 'edit';
      render();
    });
    wrap.appendChild(editBtn);
    return wrap;
  }

  function editMode(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'zg-md-edit';

    const textarea = document.createElement('textarea');
    textarea.className = 'zg-md-textarea';
    textarea.value = currentBody;
    textarea.rows = Math.max(8, Math.min(30, currentBody.split('\n').length + 2));
    wrap.appendChild(textarea);

    const error = document.createElement('p');
    error.className = 'zg-modal-error';
    error.style.display = 'none';
    wrap.appendChild(error);

    const buttons = document.createElement('div');
    buttons.className = 'zg-md-edit-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'zg-modal-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      mode = 'view';
      render();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'zg-modal-confirm';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      const newBody = textarea.value;
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await opts.onSave(newBody);
        currentBody = newBody;
        mode = 'view';
        render();
      } catch (err) {
        error.textContent = (err as Error).message;
        error.style.display = '';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    wrap.appendChild(buttons);

    setTimeout(() => textarea.focus(), 0);
    return wrap;
  }

  render();
  return container;
}

/**
 * Strip frontmatter from a requirements.md (or any) file's full content.
 * Returns the frontmatter prefix (including delimiters) and the remaining body.
 */
export function splitFrontmatter(text: string): { frontmatter: string; body: string } {
  const m = /^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/.exec(text);
  if (!m) return { frontmatter: '', body: text };
  return { frontmatter: m[1]!, body: text.slice(m[1]!.length) };
}
