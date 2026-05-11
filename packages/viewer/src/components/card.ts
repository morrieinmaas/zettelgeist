import type { SpecSummary } from '../backend.js';

export function renderCard(spec: SpecSummary): HTMLElement {
  const card = document.createElement('article');
  card.className = 'zg-card';
  card.dataset.spec = spec.name;
  card.dataset.status = spec.status;
  card.draggable = true;

  const name = document.createElement('h4');
  name.className = 'zg-card-name';
  name.textContent = spec.name;

  const meta = document.createElement('div');
  meta.className = 'zg-card-meta';

  const progressLabel = document.createElement('span');
  progressLabel.textContent = spec.progress;
  meta.appendChild(progressLabel);

  const { done, total } = parseProgress(spec.progress);
  if (total > 0) {
    const bar = document.createElement('div');
    bar.className = 'zg-card-progress';
    const fill = document.createElement('div');
    fill.className = 'zg-card-progress-bar';
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    bar.appendChild(fill);
    meta.appendChild(bar);
  }

  card.appendChild(name);
  card.appendChild(meta);

  if (spec.blockedBy) {
    const blocked = document.createElement('small');
    blocked.className = 'zg-card-blocked';
    blocked.title = spec.blockedBy;
    blocked.textContent = `blocked: ${spec.blockedBy}`;
    card.appendChild(blocked);
  }

  card.addEventListener('click', () => {
    window.location.hash = `#/spec/${encodeURIComponent(spec.name)}`;
  });

  card.addEventListener('dragstart', (e) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData('text/plain', spec.name);
    e.dataTransfer.setData('application/x-zg-status', spec.status);
    e.dataTransfer.effectAllowed = 'move';
  });

  return card;
}

function parseProgress(s: string): { done: number; total: number } {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (!m) return { done: 0, total: 0 };
  return { done: Number(m[1]), total: Number(m[2]) };
}
