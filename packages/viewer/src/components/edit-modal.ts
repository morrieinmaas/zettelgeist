import type { SpecSummary, Status } from '../backend.js';

const STATUS_OPTIONS: Array<{ value: Status | ''; label: string }> = [
  { value: '',             label: '(auto — derived)' },
  { value: 'draft',        label: 'Draft' },
  { value: 'planned',      label: 'Planned' },
  { value: 'in-progress',  label: 'In Progress' },
  { value: 'in-review',    label: 'In Review' },
  { value: 'done',         label: 'Done' },
  { value: 'blocked',      label: 'Blocked' },
  { value: 'cancelled',    label: 'Cancelled' },
];

export interface EditModalInput {
  spec: SpecSummary;
}

/**
 * Quick-edit modal for a spec card. Editable fields: status (override),
 * blocked_by (only if status=blocked), pr URL, branch, worktree path.
 *
 * On save, mutates spec via:
 *   - setStatus(name, statusValue, reason)   — drives derived state + override
 *   - patchFrontmatter(name, { pr, branch, worktree })  — free-form fields
 *
 * Returns true if any change was committed, false on cancel.
 */
export function showEditModal({ spec }: EditModalInput): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zg-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'zg-modal zg-modal-wide';

    const heading = document.createElement('h3');
    heading.textContent = `Edit "${spec.name}"`;
    dialog.appendChild(heading);

    const form = document.createElement('form');
    form.className = 'zg-edit-form';
    form.addEventListener('submit', (e) => e.preventDefault());

    const statusField = field('Status (override)', () => {
      const sel = document.createElement('select');
      sel.className = 'zg-edit-input';
      for (const opt of STATUS_OPTIONS) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.value = spec.frontmatterStatus ?? '';
      return sel;
    });

    const blockedByField = field('Blocked by (reason)', () => {
      const ta = document.createElement('textarea');
      ta.className = 'zg-edit-input';
      ta.rows = 2;
      ta.value = spec.blockedBy ?? '';
      return ta;
    });

    const prField = field('PR URL', () => {
      const input = document.createElement('input');
      input.type = 'url';
      input.className = 'zg-edit-input';
      input.placeholder = 'https://github.com/org/repo/pull/123';
      input.value = spec.pr ?? '';
      return input;
    });

    const branchField = field('Branch', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'zg-edit-input';
      input.placeholder = 'feat/foo';
      input.value = spec.branch ?? '';
      return input;
    });

    const worktreeField = field('Worktree path', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'zg-edit-input';
      input.placeholder = '../zg-foo';
      input.value = spec.worktree ?? '';
      return input;
    });

    form.append(
      statusField.row,
      blockedByField.row,
      prField.row,
      branchField.row,
      worktreeField.row,
    );

    const statusSelect = statusField.input as HTMLSelectElement;
    const blockedByTextarea = blockedByField.input as HTMLTextAreaElement;
    const prInput = prField.input as HTMLInputElement;
    const branchInput = branchField.input as HTMLInputElement;
    const worktreeInput = worktreeField.input as HTMLInputElement;

    function updateBlockedByVisibility(): void {
      blockedByField.row.style.display = statusSelect.value === 'blocked' ? '' : 'none';
    }
    statusSelect.addEventListener('change', updateBlockedByVisibility);
    updateBlockedByVisibility();

    const error = document.createElement('p');
    error.className = 'zg-modal-error';
    error.style.display = 'none';
    form.appendChild(error);

    const buttons = document.createElement('div');
    buttons.className = 'zg-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'zg-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'zg-modal-confirm';
    saveBtn.textContent = 'Save';

    buttons.appendChild(cancelBtn);
    buttons.appendChild(saveBtn);
    form.appendChild(buttons);

    dialog.appendChild(form);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(saved: boolean): void {
      overlay.remove();
      resolve(saved);
    }

    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    saveBtn.addEventListener('click', async () => {
      const newStatus = (statusSelect.value || null) as Status | null;
      const newBlockedBy = blockedByTextarea.value.trim();
      const newPr = prInput.value.trim();
      const newBranch = branchInput.value.trim();
      const newWorktree = worktreeInput.value.trim();

      if (newStatus === 'blocked' && !newBlockedBy) {
        error.textContent = 'Blocked status requires a reason.';
        error.style.display = '';
        blockedByTextarea.focus();
        return;
      }

      saveBtn.disabled = true;
      cancelBtn.disabled = true;

      try {
        const backend = window.zettelgeistBackend;

        const patch: Record<string, unknown> = {};
        diffField(patch, 'pr', spec.pr, newPr);
        diffField(patch, 'branch', spec.branch, newBranch);
        diffField(patch, 'worktree', spec.worktree, newWorktree);
        if (Object.keys(patch).length > 0) {
          await backend.patchFrontmatter(spec.name, patch);
        }

        const statusChanged = newStatus !== spec.frontmatterStatus;
        const reasonChanged = newStatus === 'blocked' && (spec.blockedBy ?? '') !== newBlockedBy;
        if (statusChanged || reasonChanged) {
          await backend.setStatus(
            spec.name,
            newStatus,
            newStatus === 'blocked' ? newBlockedBy : undefined,
          );
        }

        close(true);
      } catch (err) {
        error.textContent = (err as Error).message;
        error.style.display = '';
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });

    statusSelect.focus();
  });
}

function field(labelText: string, mkInput: () => HTMLElement): { row: HTMLElement; input: HTMLElement } {
  const row = document.createElement('label');
  row.className = 'zg-edit-row';
  const span = document.createElement('span');
  span.className = 'zg-edit-label';
  span.textContent = labelText;
  const input = mkInput();
  row.appendChild(span);
  row.appendChild(input);
  return { row, input };
}

function diffField(patch: Record<string, unknown>, key: string, oldVal: string | null, newVal: string): void {
  const o = oldVal ?? '';
  if (o === newVal) return;
  patch[key] = newVal === '' ? null : newVal;
}
