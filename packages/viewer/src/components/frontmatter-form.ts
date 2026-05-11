import type { SpecDetail } from '../backend.js';
import { showAlert } from './prompt-modal.js';

// Fields that have dedicated editors elsewhere — the edit modal owns the
// status / blocked_by override lifecycle (calls setStatus), so we exclude
// them from this form to avoid two places writing the same fields.
const FORBIDDEN_KEYS = new Set(['status', 'blocked_by']);

// Known array-of-strings fields. We render these as a comma-separated text
// input on this form; unknown fields stay as raw JSON so the form never
// loses information.
const ARRAY_KEYS = new Set(['depends_on']);

/**
 * Render the `<details>` frontmatter section under the Requirements tab.
 * Every recognised field is an editable input; unrecognised fields fall
 * back to a raw JSON textarea so power users can still edit them without
 * the form clobbering data it doesn't understand.
 *
 * Save commits a single patch via `backend.patchFrontmatter` — keys whose
 * input is cleared get a `null` value in the patch (which deletes them
 * server-side).
 */
export function renderFrontmatterForm(spec: SpecDetail): HTMLElement {
  const container = document.createElement('details');
  container.className = 'zg-frontmatter';
  // Default to expanded so the editable fields are visible. Users can
  // collapse it; the toggle state isn't persisted yet — fine for v0.1.
  container.open = true;

  const summary = document.createElement('summary');
  summary.textContent = 'Frontmatter';
  container.appendChild(summary);

  const editable = Object.entries(spec.frontmatter).filter(([k]) => !FORBIDDEN_KEYS.has(k));

  if (editable.length === 0 && Object.keys(spec.frontmatter).length === 0) {
    const empty = document.createElement('p');
    empty.className = 'zg-fm-empty';
    empty.innerHTML = '<em>No frontmatter set.</em> Use the field below to add one.';
    container.appendChild(empty);
  }

  const form = document.createElement('div');
  form.className = 'zg-fm-form';
  form.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+Enter anywhere in the form = save.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    }
  });

  // Render an editor row per existing field.
  const rows: Array<{ key: string; getValue: () => unknown }> = [];
  for (const [key, value] of editable) rows.push(renderRow(form, key, value));

  // "+ Add field" — append a new row, key + value both empty.
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'zg-fm-add';
  addBtn.textContent = '+ Add field';
  addBtn.addEventListener('click', () => {
    const row = renderRow(form, '', '');
    rows.push(row);
    form.insertBefore(row.el, addBtn);
    row.focusKey();
  });

  const status = document.createElement('p');
  status.className = 'zg-fm-status';
  status.style.display = 'none';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'zg-fm-save';
  saveBtn.textContent = 'Save frontmatter';

  async function save(): Promise<void> {
    saveBtn.disabled = true;
    try {
      // Build a patch: every field in rows gets its current value; fields
      // that existed originally but are now missing/empty get `null` (delete).
      const original = new Map(editable);
      const present = new Map<string, unknown>();
      for (const r of rows) {
        const k = r.key;
        if (!k) continue;
        present.set(k, r.getValue());
      }
      const patch: Record<string, unknown> = {};
      for (const [k, v] of present) patch[k] = v;
      for (const k of original.keys()) {
        if (!present.has(k)) patch[k] = null;
      }

      if (Object.keys(patch).length === 0) {
        status.textContent = 'Nothing to save.';
        status.style.display = '';
        return;
      }

      await window.zettelgeistBackend.patchFrontmatter(spec.name, patch);
      status.textContent = 'Saved.';
      status.style.display = '';
      // Trigger a route refresh so the rest of the page (status pill,
      // wiki-link resolver) picks up changes.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      void showAlert('Save failed', (err as Error).message);
    } finally {
      saveBtn.disabled = false;
    }
  }
  saveBtn.addEventListener('click', () => void save());

  form.appendChild(addBtn);

  const actions = document.createElement('div');
  actions.className = 'zg-fm-actions';
  actions.appendChild(status);
  actions.appendChild(saveBtn);

  container.appendChild(form);
  container.appendChild(actions);
  return container;
}

interface Row {
  key: string;
  el: HTMLElement;
  getValue: () => unknown;
  focusKey: () => void;
}

function renderRow(parent: HTMLElement, initialKey: string, initialValue: unknown): Row {
  const row = document.createElement('div');
  row.className = 'zg-fm-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'zg-fm-key';
  keyInput.value = initialKey;
  keyInput.placeholder = 'field';
  // Built-in fields aren't renameable in-place (rename would be delete +
  // add, with semantic risk). Locking the key for existing fields keeps
  // the patch logic simple.
  const isExisting = initialKey !== '';
  if (isExisting) keyInput.readOnly = true;

  const valueEl = makeValueInput(initialKey, initialValue);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'zg-fm-remove';
  removeBtn.title = 'Remove field (will be deleted on save)';
  removeBtn.textContent = '🗑';
  removeBtn.addEventListener('click', () => {
    row.remove();
    // The save handler treats missing rows as deletions.
  });

  row.appendChild(keyInput);
  row.appendChild(valueEl.el);
  row.appendChild(removeBtn);
  parent.appendChild(row);

  // The "key" we report to the patch builder reflects whatever's in the
  // key field at save time — supports renaming when it's a new row.
  return {
    get key() { return keyInput.value.trim(); },
    el: row,
    getValue: valueEl.getValue,
    focusKey: () => keyInput.focus(),
  };
}

function makeValueInput(key: string, value: unknown): { el: HTMLElement; getValue: () => unknown } {
  // Array editor: comma-separated text input for known array fields
  // (depends_on). Round-trips cleanly through patchFrontmatter, which
  // expects arbitrary JSON values.
  if (ARRAY_KEYS.has(key) || (Array.isArray(value) && value.every((v) => typeof v === 'string'))) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'zg-fm-value';
    input.placeholder = 'comma-separated, e.g. user-auth, billing';
    input.value = Array.isArray(value) ? value.join(', ') : '';
    return {
      el: input,
      getValue: (): string[] => input.value.split(',').map((s) => s.trim()).filter(Boolean),
    };
  }
  // Plain string: text input. Most other frontmatter fields (part_of,
  // replaces, pr, branch, worktree) are strings; treat unset as empty.
  if (value === null || value === undefined || typeof value === 'string') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'zg-fm-value';
    input.value = typeof value === 'string' ? value : '';
    return {
      el: input,
      getValue: (): string | null => {
        const t = input.value.trim();
        return t === '' ? null : t;
      },
    };
  }
  // Boolean: checkbox (covers auto_merge etc.).
  if (typeof value === 'boolean') {
    const wrap = document.createElement('label');
    wrap.className = 'zg-fm-value zg-fm-bool';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(value ? 'true' : 'false'));
    input.addEventListener('change', () => {
      wrap.lastChild!.textContent = input.checked ? 'true' : 'false';
    });
    return { el: wrap, getValue: () => input.checked };
  }
  // Fallback: raw JSON textarea. Preserves complex values (objects, mixed
  // arrays) — power users can still edit them without losing data.
  const ta = document.createElement('textarea');
  ta.className = 'zg-fm-value zg-fm-json';
  ta.rows = 2;
  ta.value = JSON.stringify(value);
  return {
    el: ta,
    getValue: () => {
      try { return JSON.parse(ta.value); }
      catch { return ta.value; }  // fall back to raw string on parse error
    },
  };
}
