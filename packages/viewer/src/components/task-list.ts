import type { Task } from '../backend.js';

export function renderTaskList(specName: string, tasks: Task[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'zg-task-list';

  if (tasks.length === 0) {
    const empty = document.createElement('li');
    const em = document.createElement('em');
    em.textContent = 'No tasks yet.';
    empty.appendChild(em);
    list.appendChild(empty);
    return list;
  }

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = 'zg-task';
    item.dataset.index = String(task.index);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.checked;
    checkbox.addEventListener('change', async () => {
      const backend = window.zettelgeistBackend;
      try {
        if (checkbox.checked) {
          await backend.tickTask(specName, task.index);
        } else {
          await backend.untickTask(specName, task.index);
        }
        // Trigger a refresh by re-firing the current route (simpler than re-rendering inline for v0.1)
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        checkbox.checked = !checkbox.checked; // revert
        alert((err as Error).message);
      }
    });

    const label = document.createElement('label');
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

    list.appendChild(item);
  }

  return list;
}
