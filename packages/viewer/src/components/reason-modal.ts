export interface ReasonModalOptions {
  title: string;
  message: string;
  reasonRequired: boolean;
  reasonLabel: string;
  confirmLabel: string;
}

/**
 * Show a modal dialog asking the user for a reason. Returns the entered reason
 * on confirm, or null if cancelled.
 */
export function showReasonModal(opts: ReasonModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zg-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'zg-modal';

    const heading = document.createElement('h3');
    heading.textContent = opts.title;
    dialog.appendChild(heading);

    const message = document.createElement('p');
    message.textContent = opts.message;
    dialog.appendChild(message);

    const label = document.createElement('label');
    label.className = 'zg-modal-label';
    label.textContent = opts.reasonLabel;
    const textarea = document.createElement('textarea');
    textarea.className = 'zg-modal-textarea';
    textarea.rows = 3;
    textarea.required = opts.reasonRequired;
    label.appendChild(textarea);
    dialog.appendChild(label);

    const error = document.createElement('p');
    error.className = 'zg-modal-error';
    error.style.display = 'none';
    dialog.appendChild(error);

    const buttons = document.createElement('div');
    buttons.className = 'zg-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'zg-modal-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'zg-modal-confirm';
    confirmBtn.textContent = opts.confirmLabel;

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(buttons);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(value: string | null): void {
      overlay.remove();
      resolve(value);
    }

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    confirmBtn.addEventListener('click', () => {
      const reason = textarea.value.trim();
      if (opts.reasonRequired && !reason) {
        error.textContent = 'Reason required.';
        error.style.display = '';
        textarea.focus();
        return;
      }
      close(reason);
    });

    textarea.focus();
  });
}
