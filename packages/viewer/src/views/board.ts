import type { Status, SpecSummary } from '../backend.js';
import { renderCard } from '../components/card.js';
import { fetchAndRenderValidationBanner } from '../components/validation-banner.js';
import { showInputModal, showAlert } from '../components/prompt-modal.js';
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

  app.innerHTML = '';

  const banner = await fetchAndRenderValidationBanner();
  if (banner) app.appendChild(banner);

  if (specs.length === 0) {
    app.appendChild(renderEmptyState());
    return;
  }

  const byStatus: Record<Status, SpecSummary[]> = {
    'draft': [], 'planned': [], 'in-progress': [], 'in-review': [],
    'done': [], 'blocked': [], 'cancelled': [],
  };
  for (const s of specs) byStatus[s.status].push(s);

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

    // Per-column "+" — creates a new spec already at this column's status,
    // pre-filled with a template. Prompt is browser-native for v0.1; a
    // proper modal can replace it later.
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'zg-column-add';
    addBtn.title = `New spec in ${COLUMN_LABELS[status]}`;
    addBtn.setAttribute('aria-label', `New spec in ${COLUMN_LABELS[status]}`);
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => void createSpecInColumn(status, specs));

    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(addBtn);

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

// Status-aware templates for new-spec creation. The frontmatter pins the
// spec to the source column (relies on deriveStatus honoring frontmatter
// `status:` for all 7 values — shipped earlier).
function templateFor(name: string, status: Status, blockedBy?: string): { requirements: string; tasks: string } {
  const fmLines: string[] = ['---'];
  // Pin to the chosen column unless it's one of the derived-friendly statuses
  // (planned/in-progress emerge naturally from task state); even for those we
  // pin explicitly so the new spec appears in the right column immediately.
  fmLines.push(`status: ${status}`);
  if (status === 'blocked' && blockedBy) fmLines.push(`blocked_by: ${JSON.stringify(blockedBy)}`);
  fmLines.push('depends_on: []');
  fmLines.push('---');
  const requirements =
    `${fmLines.join('\n')}\n# ${name}\n\n## Why\n\n<!-- Why does this spec exist? -->\n\n` +
    `## Acceptance criteria\n\n- [ ] WHEN <trigger>\n- [ ] THE SYSTEM SHALL <observable behavior>\n\n` +
    `## Out of scope\n\n- \n\n## References\n\n- \n`;
  const tasks = `- [ ] 1. \n`;
  return { requirements, tasks };
}

async function createSpecInColumn(status: Status, existing: SpecSummary[]): Promise<void> {
  // In-DOM modal — window.prompt() is silently blocked in VSCode webviews,
  // so the same flow works in browser AND inside the extension panel.
  const raw = await showInputModal({
    title: `New spec in "${status}"`,
    message: 'Lowercase letters, numbers, and dashes. Example: "user-auth".',
    placeholder: 'my-new-spec',
    confirmLabel: 'Create',
    validate: (v) => {
      const t = v.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!t) return 'Name is required.';
      if (existing.some((s) => s.name === t)) return `A spec named "${t}" already exists.`;
      return null;
    },
  });
  if (raw === null) return;
  const name = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!name) return;

  let blockedBy: string | undefined;
  if (status === 'blocked') {
    const reason = await showInputModal({
      title: `Why is "${name}" blocked?`,
      message: 'A reason is required for blocked specs.',
      confirmLabel: 'Create',
      validate: (v) => v.trim() ? null : 'Reason is required.',
    });
    if (reason === null) return;
    blockedBy = reason.trim();
  }

  const { requirements, tasks } = templateFor(name, status, blockedBy);
  try {
    const backend = window.zettelgeistBackend;
    // Two writes, two commits — each is small and round-trips through the
    // same regen-and-commit path the rest of the editor uses.
    await backend.writeSpecFile(name, 'requirements.md', requirements);
    await backend.writeSpecFile(name, 'tasks.md', tasks);
    // Jump to the new spec's detail view so the user can start editing.
    window.location.hash = `#/spec/${encodeURIComponent(name)}`;
  } catch (err) {
    void showAlert('Error', (err as Error).message);
  }
}

function renderEmptyState(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'zg-empty-state';

  const title = document.createElement('h2');
  title.textContent = 'No specs yet';
  wrap.appendChild(title);

  const blurb = document.createElement('p');
  blurb.textContent =
    'A spec is a folder under specs/ with at least one of requirements.md, tasks.md, ' +
    'handoff.md, or lenses/*.md. Create one by hand or ask your agent to.';
  wrap.appendChild(blurb);

  const example = document.createElement('pre');
  example.className = 'zg-empty-example';
  example.textContent =
    'specs/my-first-spec/\n' +
    '  requirements.md   # markdown body (optionally with --- frontmatter ---)\n' +
    '  tasks.md          # "- [ ] 1. task text" lines\n\n' +
    '# then:\n' +
    'zettelgeist regen     # rebuilds specs/INDEX.md\n';
  wrap.appendChild(example);

  const hint = document.createElement('p');
  hint.className = 'zg-empty-hint';
  hint.innerHTML =
    'Refresh this page once the spec is on disk — the board will pick it up.';
  wrap.appendChild(hint);

  return wrap;
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
      void showAlert('Error', (err as Error).message);
    }
  });
}
