import type { SpecDetail } from '../backend.js';

export function renderFrontmatterForm(spec: SpecDetail): HTMLElement {
  const container = document.createElement('details');
  container.className = 'zg-frontmatter';

  const summary = document.createElement('summary');
  summary.textContent = 'Frontmatter';
  container.appendChild(summary);

  if (Object.keys(spec.frontmatter).length === 0) {
    const empty = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = 'No frontmatter set.';
    empty.appendChild(em);
    container.appendChild(empty);
    return container;
  }

  const dl = document.createElement('dl');
  for (const [key, value] of Object.entries(spec.frontmatter)) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = JSON.stringify(value);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  container.appendChild(dl);

  return container;
}
