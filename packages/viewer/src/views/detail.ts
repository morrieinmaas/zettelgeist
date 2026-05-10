import type { SpecDetail } from '../backend.js';
import { renderTabs } from '../components/tabs.js';
import { renderTaskList } from '../components/task-list.js';
import { renderFrontmatterForm } from '../components/frontmatter-form.js';
import { marked } from 'marked';

export async function renderDetail(params: Record<string, string>): Promise<void> {
  const app = document.getElementById('app')!;
  const name = params.name;
  if (!name) {
    app.innerHTML = '<p class="zg-error">Missing spec name in URL.</p>';
    return;
  }

  app.innerHTML = '<p>Loading…</p>';

  const backend = window.zettelgeistBackend;
  let spec: SpecDetail;
  try {
    spec = await backend.readSpec(name);
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to load spec "${name}": ${(err as Error).message}</p>`;
    return;
  }

  app.innerHTML = '';
  const wrapper = document.createElement('article');
  wrapper.className = 'zg-detail';

  const header = document.createElement('header');
  header.className = 'zg-detail-header';
  const back = document.createElement('a');
  back.href = '#/';
  back.textContent = '← Back to board';
  back.className = 'zg-back-link';
  const title = document.createElement('h2');
  title.textContent = spec.name;
  header.appendChild(back);
  header.appendChild(title);
  wrapper.appendChild(header);

  const tabs = [
    { id: 'requirements', label: 'Requirements', render: () => renderRequirementsTab(spec) },
    { id: 'tasks',        label: `Tasks (${spec.tasks.length})`, render: () => renderTasksTab(spec) },
    { id: 'handoff',      label: 'Handoff', render: () => renderHandoffTab(spec) },
  ];
  if (Object.keys(spec.lenses).length > 0) {
    tabs.push({ id: 'lenses', label: 'Lenses', render: () => renderLensesTab(spec) });
  }

  wrapper.appendChild(renderTabs(tabs));
  app.appendChild(wrapper);
}

function renderRequirementsTab(spec: SpecDetail): HTMLElement {
  const container = document.createElement('div');
  container.appendChild(renderFrontmatterForm(spec));
  const body = document.createElement('div');
  body.className = 'zg-markdown';
  if (spec.requirements) {
    body.innerHTML = marked.parse(spec.requirements) as string;
  } else {
    body.innerHTML = '<p><em>No requirements.md yet.</em></p>';
  }
  container.appendChild(body);
  return container;
}

function renderTasksTab(spec: SpecDetail): HTMLElement {
  return renderTaskList(spec.name, spec.tasks);
}

function renderHandoffTab(spec: SpecDetail): HTMLElement {
  const container = document.createElement('div');
  container.className = 'zg-markdown';
  if (spec.handoff) {
    container.innerHTML = marked.parse(spec.handoff) as string;
  } else {
    container.innerHTML = '<p><em>No handoff.md yet.</em></p>';
  }
  return container;
}

function renderLensesTab(spec: SpecDetail): HTMLElement {
  const container = document.createElement('div');
  for (const [name, content] of Object.entries(spec.lenses)) {
    const heading = document.createElement('h3');
    heading.textContent = name;
    container.appendChild(heading);
    const body = document.createElement('div');
    body.className = 'zg-markdown';
    body.innerHTML = marked.parse(content) as string;
    container.appendChild(body);
  }
  return container;
}
