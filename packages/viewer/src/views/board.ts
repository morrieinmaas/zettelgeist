import type { Status, SpecSummary } from '../backend.js';
import { renderCard } from '../components/card.js';

const COLUMN_ORDER: Status[] = [
  'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
];

const COLUMN_LABELS: Record<Status, string> = {
  'draft': 'Draft',
  'planned': 'Planned',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  'done': 'Done',
  'blocked': 'Blocked',
  'cancelled': 'Cancelled',
};

export async function renderBoard(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Loading specs…</p>';

  const backend = window.zettelgeistBackend;
  let specs: SpecSummary[];
  try {
    specs = await backend.listSpecs();
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to load specs: ${(err as Error).message}</p>`;
    return;
  }

  const byStatus: Record<Status, SpecSummary[]> = {
    'draft': [], 'planned': [], 'in-progress': [], 'in-review': [],
    'done': [], 'blocked': [], 'cancelled': [],
  };
  for (const s of specs) byStatus[s.status].push(s);

  app.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'zg-board';

  for (const status of COLUMN_ORDER) {
    const column = document.createElement('section');
    column.className = 'zg-column';
    column.dataset.status = status;

    const header = document.createElement('header');
    header.className = 'zg-column-header';

    const title = document.createElement('h3');
    title.textContent = COLUMN_LABELS[status];
    const count = document.createElement('span');
    count.className = 'zg-column-count';
    count.textContent = String(byStatus[status].length);
    header.appendChild(title);
    header.appendChild(count);

    const cards = document.createElement('div');
    cards.className = 'zg-column-cards';
    for (const spec of byStatus[status]) {
      cards.appendChild(renderCard(spec));
    }

    column.appendChild(header);
    column.appendChild(cards);
    board.appendChild(column);
  }

  app.appendChild(board);
}
