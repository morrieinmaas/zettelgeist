import type { SpecSummary } from '../backend.js';

export function renderCard(spec: SpecSummary): HTMLElement {
  const card = document.createElement('article');
  card.className = 'zg-card';
  card.dataset.spec = spec.name;
  card.dataset.status = spec.status;
  card.draggable = true;

  const header = document.createElement('div');
  header.className = 'zg-card-header';

  const name = document.createElement('h4');
  name.className = 'zg-card-name';
  name.textContent = spec.name;

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'zg-card-edit';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', `Edit ${spec.name}`);
  editBtn.textContent = '✎';
  editBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { showEditModal } = await import('./edit-modal.js');
    const saved = await showEditModal({ spec });
    if (saved) window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  header.appendChild(name);
  header.appendChild(editBtn);

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

  card.appendChild(header);
  card.appendChild(meta);

  if (spec.pr || spec.branch) {
    const badges = document.createElement('div');
    badges.className = 'zg-card-badges';
    if (spec.pr) {
      const a = document.createElement('a');
      a.className = 'zg-badge zg-badge-pr';
      a.href = spec.pr;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = spec.pr;
      a.textContent = prLabel(spec.pr);
      a.addEventListener('click', (e) => e.stopPropagation());
      badges.appendChild(a);
    }
    if (spec.branch) {
      const span = document.createElement('span');
      span.className = 'zg-badge zg-badge-branch';
      span.title = spec.branch;
      span.textContent = spec.branch;
      badges.appendChild(span);
    }
    card.appendChild(badges);
  }

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

function prLabel(url: string): string {
  // GitHub: extract "#123" from /pull/123
  const gh = /\/pull\/(\d+)/.exec(url);
  if (gh) return `PR #${gh[1]}`;
  return 'PR';
}
