import type { Status, SpecSummary } from '../backend.js';
import { renderCard } from '../components/card.js';
import { escapeHtml } from '../util/sanitize.js';

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
    app.innerHTML = `<p class="zg-error">Failed to load specs: ${escapeHtml((err as Error).message)}</p>`;
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
    attachDropHandlers(column, status);
    board.appendChild(column);
  }

  app.appendChild(board);
}

// Dragging a card onto a column writes `status: <target>` to the spec's
// frontmatter as an explicit override. Markdown is the source of truth — drops
// commit the change immediately. `blocked` requires a reason (stored in
// `blocked_by`); `cancelled` accepts an optional reason; the other 5 just write.
function attachDropHandlers(column: HTMLElement, status: Status): void {
  column.addEventListener('dragover', (e) => {
    e.preventDefault();
    column.classList.add('zg-column-drop-target');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });

  column.addEventListener('dragleave', () => {
    column.classList.remove('zg-column-drop-target');
  });

  column.addEventListener('drop', async (e) => {
    e.preventDefault();
    column.classList.remove('zg-column-drop-target');
    const specName = e.dataTransfer?.getData('text/plain');
    if (!specName) return;

    const sourceStatus = (e.dataTransfer?.getData('application/x-zg-status') || '') as Status | '';
    if (sourceStatus === status) return; // no-op drop on origin column

    let reason: string | null | undefined;
    if (status === 'blocked' || status === 'cancelled') {
      const { showReasonModal } = await import('../components/reason-modal.js');
      reason = await showReasonModal({
        title: status === 'blocked' ? 'Mark as Blocked' : 'Mark as Cancelled',
        message: `Mark "${specName}" as ${status}.`,
        reasonRequired: status === 'blocked',
        reasonLabel: status === 'blocked' ? "What's blocking it?" : 'Reason (optional):',
        confirmLabel: status === 'blocked' ? 'Mark Blocked' : 'Mark Cancelled',
      });
      if (reason === null) return;
    }

    try {
      await window.zettelgeistBackend.setStatus(specName, status, reason || undefined);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      alert((err as Error).message);
    }
  });
}
