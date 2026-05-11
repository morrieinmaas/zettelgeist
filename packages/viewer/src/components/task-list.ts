import type { Task } from '../backend.js';
import { showConfirmModal, showAlert } from './prompt-modal.js';

export function renderTaskList(specName: string, tasks: Task[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'zg-tasks';

  const list = document.createElement('ul');
  list.className = 'zg-task-list';

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    const em = document.createElement('em');
    em.textContent = 'No tasks yet — add the first one below.';
    empty.appendChild(em);
    list.appendChild(empty);
  } else {
    for (const task of tasks) list.appendChild(renderTaskItem(specName, task));
  }

  wrap.appendChild(list);
  wrap.appendChild(renderAddForm(specName));
  return wrap;
}

function renderTaskItem(specName: string, task: Task): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'zg-task';
  item.dataset.index = String(task.index);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.checked;
  checkbox.addEventListener('change', async () => {
    const backend = window.zettelgeistBackend;
    try {
      if (checkbox.checked) await backend.tickTask(specName, task.index);
      else                  await backend.untickTask(specName, task.index);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      checkbox.checked = !checkbox.checked;
      void showAlert('Error', (err as Error).message);
    }
  });

  const label = document.createElement('label');
  label.className = 'zg-task-label';
  label.textContent = ` ${task.text}`;
  label.prepend(checkbox);
  item.appendChild(label);

  if (task.tags.length > 0) {
    const tags = document.createElement('span');
    tags.className = 'zg-task-tags';
    for (const tag of task.tags) {
      const badge = document.createElement('small');
      badge.className = 'zg-tag';
      badge.textContent = tag;
      tags.appendChild(badge);
    }
    item.appendChild(tags);
  }

  const actions = document.createElement('span');
  actions.className = 'zg-task-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'zg-task-edit';
  editBtn.title = 'Edit task text';
  editBtn.setAttribute('aria-label', `Edit task ${task.index}`);
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => startInlineEdit(specName, task, item));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'zg-task-delete';
  delBtn.title = 'Delete task';
  delBtn.setAttribute('aria-label', `Delete task ${task.index}`);
  delBtn.textContent = '🗑';
  delBtn.addEventListener('click', () => deleteTask(specName, task.index));

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  item.appendChild(actions);

  return item;
}

function renderAddForm(specName: string): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'zg-task-add';
  form.addEventListener('submit', (e) => e.preventDefault());

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'zg-task-add-input';
  input.placeholder = 'New task… (use #human-only / #agent-only / #skip for tags)';
  input.setAttribute('aria-label', 'New task text');

  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.className = 'zg-task-add-btn';
  btn.textContent = 'Add';

  const submit = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true;
    try {
      await appendTask(specName, text);
      input.value = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      void showAlert('Error', (err as Error).message);
    } finally {
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit(); }
  });

  form.appendChild(input);
  form.appendChild(btn);
  return form;
}

function startInlineEdit(specName: string, task: Task, item: HTMLLIElement): void {
  const label = item.querySelector('.zg-task-label') as HTMLLabelElement;
  if (!label) return;

  // Pre-fill with text + tags so existing tags are visible AND editable.
  // The user can type new tags, remove old ones, or rewrite the text —
  // it all round-trips back to the markdown line.
  const tagsSuffix = task.tags.length > 0 ? ' ' + task.tags.join(' ') : '';
  const original = task.text + tagsSuffix;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'zg-task-edit-input';
  input.value = original;
  input.placeholder = 'task text  #human-only / #agent-only / #skip';

  label.style.display = 'none';
  const actions = item.querySelector('.zg-task-actions') as HTMLElement;
  if (actions) actions.style.display = 'none';
  // Also hide the tag badges while editing — they're now part of the input value.
  const tagsEl = item.querySelector('.zg-task-tags') as HTMLElement | null;
  if (tagsEl) tagsEl.style.display = 'none';
  item.insertBefore(input, label);
  input.focus();
  input.select();

  const finish = async (commit: boolean): Promise<void> => {
    const next = input.value.trim();
    input.remove();
    label.style.display = '';
    if (actions) actions.style.display = '';
    if (tagsEl) tagsEl.style.display = '';

    if (!commit || !next || next === original) return;
    try {
      await replaceTask(specName, task.index, next);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      void showAlert('Error', (err as Error).message);
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')      { e.preventDefault(); void finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); void finish(false); }
  });
  input.addEventListener('blur', () => void finish(true));
}

// ---------------------------------------------------------------------------
// File-level mutations: append / replace / delete a task in tasks.md.
// tasks.md is plain — no frontmatter — so we read, rewrite, write via the
// existing writeSpecFile backend method.
// ---------------------------------------------------------------------------

async function readTasksFile(specName: string): Promise<string> {
  try {
    const { content } = await window.zettelgeistBackend.readSpecFile(specName, 'tasks.md');
    return content;
  } catch {
    return '';
  }
}

const TASK_LINE = /^([\s>]*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;

async function appendTask(specName: string, text: string): Promise<void> {
  const current = await readTasksFile(specName);
  // Tasks numbering is `N. text` — count existing checkbox lines, append next index.
  const existing = current.split('\n').filter((l) => TASK_LINE.test(l)).length;
  const nextIndex = existing + 1;
  const newLine = `- [ ] ${nextIndex}. ${text}`;
  const next = current.endsWith('\n') || current === '' ? `${current}${newLine}\n` : `${current}\n${newLine}\n`;
  await window.zettelgeistBackend.writeSpecFile(specName, 'tasks.md', next);
}

async function replaceTask(specName: string, n: number, text: string): Promise<void> {
  const current = await readTasksFile(specName);
  const lines = current.split('\n');
  let count = 0;
  let mutated = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(TASK_LINE);
    if (!m) continue;
    count++;
    if (count === n) {
      // Preserve checkbox state + leading whitespace; replace the trailing text.
      // Also try to preserve the leading "<index>. " numbering if present.
      const body = m[4]!;
      const numPrefix = /^(\d+\.\s+)/.exec(body);
      const replacement = numPrefix ? numPrefix[1]! + text : text;
      lines[i] = `${m[1]!}${m[2]!}${m[3]!}${replacement}`;
      mutated = true;
      break;
    }
  }
  if (!mutated) throw new Error(`no task at index ${n}`);
  await window.zettelgeistBackend.writeSpecFile(specName, 'tasks.md', lines.join('\n'));
}

async function deleteTask(specName: string, n: number): Promise<void> {
  // In-DOM modal — confirm() is silently blocked in VSCode webviews, where
  // clicking × on a task would do nothing without it.
  const ok = await showConfirmModal({
    title: `Delete task ${n}?`,
    message: 'This removes the line and renumbers the remaining tasks.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  try {
    const current = await readTasksFile(specName);
    const lines = current.split('\n');
    const kept: string[] = [];
    let count = 0;
    let renumber = 0;
    for (const line of lines) {
      const m = line.match(TASK_LINE);
      if (!m) { kept.push(line); continue; }
      count++;
      if (count === n) continue; // drop this one
      // Renumber the remaining tasks so the file's internal "N." stays sequential.
      renumber++;
      const body = m[4]!;
      const replaced = body.replace(/^\d+\.\s+/, `${renumber}. `);
      kept.push(`${m[1]!}${m[2]!}${m[3]!}${replaced}`);
    }
    await window.zettelgeistBackend.writeSpecFile(specName, 'tasks.md', kept.join('\n'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (err) {
    void showAlert('Error', (err as Error).message);
  }
}
