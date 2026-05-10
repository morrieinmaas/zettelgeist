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
  meta.textContent = `${spec.progress}`;

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

  return card;
}
