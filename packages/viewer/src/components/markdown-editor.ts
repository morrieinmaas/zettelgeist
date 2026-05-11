import { marked } from 'marked';
import { sanitizeHtml } from '../util/sanitize.js';

// GFM is the default in marked v10+ but we set it explicitly so task-list
// items (`- [ ] foo` / `- [x] foo`) render as <input type="checkbox"> rather
// than plain bullets. The Tasks tab handles interactive editing; markdown
// bodies (requirements / handoff / lenses) get the visual representation.
marked.setOptions({ gfm: true });

export interface MarkdownEditorOptions {
  /** The current markdown body (no frontmatter). Pre-fills the textarea. */
  body: string | null;
  /** Title shown in the empty state — e.g. "No requirements.md yet". */
  emptyPlaceholder: string;
  /** Optional one-line hint under the empty-state title to coach next action. */
  emptyHint?: string;
  /**
   * Optional starter template pre-loaded into the textarea when the user
   * clicks "Start writing" on the empty state. Gives them headings + prompts
   * instead of a blank cursor.
   */
  startingTemplate?: string;
  /** Save handler — receives the new body string. Throws → error displayed. */
  onSave: (newBody: string) => Promise<void>;
  /**
   * Optional post-render hook called after the rendered markdown is mounted.
   * Used for cross-cutting transforms like turning `[[name]]` into wiki-links
   * — done in a single place rather than per-tab in detail.ts.
   */
  postRender?: (rendered: HTMLElement) => void;
  /**
   * If true, GFM task-list checkboxes inside the rendered body become
   * interactive in view mode: clicking toggles the underlying `- [ ]`
   * line and auto-saves via `onSave`. Lets users tick acceptance criteria
   * without entering edit mode.
   */
  interactiveCheckboxes?: boolean;
}

// Match a markdown task-list line: leading whitespace + bullet + [x] / [ ].
const TASK_LIST_LINE_RE = /^([\s>]*[-*+]\s+\[)([ xX])(\])/;

function toggleNthTaskLine(body: string, n: number, checked: boolean): string | null {
  const lines = body.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = TASK_LIST_LINE_RE.exec(line);
    if (!m) continue;
    if (count === n) {
      lines[i] = `${m[1]!}${checked ? 'x' : ' '}${m[3]!}${line.slice(m[0].length)}`;
      return lines.join('\n');
    }
    count++;
  }
  return null;
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
  // Pre-fill the textarea with the starter template when the user enters
  // edit mode from an empty body. Tracked separately so re-entering edit
  // after a cancelled save preserves what they typed.
  let pendingTemplate: string | null = null;

  function render(): void {
    container.innerHTML = '';
    if (mode === 'view') {
      container.appendChild(viewMode());
    } else {
      container.appendChild(editMode());
    }
  }

  function enterEditMode(template: string | null): void {
    pendingTemplate = template;
    mode = 'edit';
    render();
  }

  function viewMode(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'zg-md-view';

    if (currentBody.trim()) {
      const body = document.createElement('div');
      body.className = 'zg-markdown';
      body.innerHTML = sanitizeHtml(marked.parse(currentBody) as string);
      if (opts.interactiveCheckboxes) wireInteractiveCheckboxes(body);
      opts.postRender?.(body);
      wrap.appendChild(body);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'zg-md-edit-btn';
      editBtn.textContent = '✎ Edit';
      editBtn.addEventListener('click', () => enterEditMode(null));
      wrap.appendChild(editBtn);
    } else {
      wrap.appendChild(renderEmpty());
    }
    return wrap;
  }

  function wireInteractiveCheckboxes(body: HTMLElement): void {
    const inputs = Array.from(body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    inputs.forEach((input, idx) => {
      input.disabled = false;
      input.style.cursor = 'pointer';
      input.addEventListener('change', async () => {
        const desired = input.checked;
        const nextBody = toggleNthTaskLine(currentBody, idx, desired);
        if (nextBody === null) {
          // Couldn't find the corresponding source line — bail rather than
          // silently corrupting. Revert the checkbox to its previous state.
          input.checked = !desired;
          return;
        }
        input.disabled = true;  // prevent double-clicks mid-save
        try {
          await opts.onSave(nextBody);
          currentBody = nextBody;
        } catch (err) {
          input.checked = !desired;
          alert((err as Error).message);
        } finally {
          input.disabled = false;
        }
      });
    });
  }

  function renderEmpty(): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'zg-md-empty';

    const title = document.createElement('h3');
    title.textContent = opts.emptyPlaceholder;
    empty.appendChild(title);

    if (opts.emptyHint) {
      const hint = document.createElement('p');
      hint.className = 'zg-md-empty-hint';
      hint.textContent = opts.emptyHint;
      empty.appendChild(hint);
    }

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'zg-md-start-btn';
    startBtn.textContent = opts.startingTemplate ? '✎ Start writing (with a template)' : '✎ Start writing';
    startBtn.addEventListener('click', () => enterEditMode(opts.startingTemplate ?? null));
    empty.appendChild(startBtn);

    return empty;
  }

  function editMode(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'zg-md-edit';

    const textarea = document.createElement('textarea');
    textarea.className = 'zg-md-textarea';
    // Pre-fill from the current body, OR — if entering edit from an empty
    // view via "Start writing" — from the starter template the caller passed.
    const initial = currentBody || pendingTemplate || '';
    pendingTemplate = null;
    textarea.value = initial;
    textarea.rows = Math.max(8, Math.min(30, initial.split('\n').length + 2));
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
