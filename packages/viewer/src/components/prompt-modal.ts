// VSCode webviews block window.prompt / window.confirm / window.alert
// silently (it's a sandboxing rule). Use an in-DOM modal instead so the
// same component works in the browser AND inside the VSCode webview.

export interface PromptModalOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  /** Optional client-side validator. Return an error string to block submit. */
  validate?: (value: string) => string | null;
}

/** Returns the entered value on confirm, or null on cancel. */
export function showInputModal(opts: PromptModalOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zg-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'zg-modal';

    const heading = document.createElement('h3');
    heading.textContent = opts.title;
    dialog.appendChild(heading);

    if (opts.message) {
      const message = document.createElement('p');
      message.textContent = opts.message;
      dialog.appendChild(message);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'zg-modal-input';
    input.value = opts.defaultValue ?? '';
    if (opts.placeholder) input.placeholder = opts.placeholder;
    dialog.appendChild(input);

    const error = document.createElement('p');
    error.className = 'zg-modal-error';
    error.style.display = 'none';
    dialog.appendChild(error);

    const buttons = document.createElement('div');
    buttons.className = 'zg-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'zg-modal-cancel';
    cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'zg-modal-confirm';
    confirmBtn.textContent = opts.confirmLabel ?? 'OK';

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(buttons);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(value: string | null): void {
      overlay.remove();
      resolve(value);
    }

    function submit(): void {
      const value = input.value;
      if (opts.validate) {
        const err = opts.validate(value);
        if (err) {
          error.textContent = err;
          error.style.display = '';
          input.focus();
          return;
        }
      }
      close(value);
    }

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });
    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')      { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(null); }
    });

    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

export interface ConfirmModalOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual emphasis for destructive actions (red confirm button). */
  destructive?: boolean;
}

/**
 * Drop-in replacement for `window.alert()`. Returns when the user dismisses.
 * Use for error reporting where inline display isn't feasible.
 */
export function showAlert(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zg-modal-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'zg-modal';
    const heading = document.createElement('h3');
    heading.textContent = title;
    dialog.appendChild(heading);
    if (message) {
      const p = document.createElement('p');
      p.textContent = message;
      dialog.appendChild(p);
    }
    const buttons = document.createElement('div');
    buttons.className = 'zg-modal-buttons';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'zg-modal-confirm';
    ok.textContent = 'OK';
    buttons.appendChild(ok);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = (): void => { overlay.remove(); resolve(); };
    ok.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' || e.key === 'Enter') {
        document.removeEventListener('keydown', esc);
        close();
      }
    });
    setTimeout(() => ok.focus(), 0);
  });
}

export function showConfirmModal(opts: ConfirmModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'zg-modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'zg-modal';

    const heading = document.createElement('h3');
    heading.textContent = opts.title;
    dialog.appendChild(heading);

    if (opts.message) {
      const message = document.createElement('p');
      message.textContent = opts.message;
      dialog.appendChild(message);
    }

    const buttons = document.createElement('div');
    buttons.className = 'zg-modal-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'zg-modal-cancel';
    cancelBtn.textContent = opts.cancelLabel ?? 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'zg-modal-confirm' + (opts.destructive ? ' zg-modal-destructive' : '');
    confirmBtn.textContent = opts.confirmLabel ?? 'OK';

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(buttons);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(value: boolean): void {
      overlay.remove();
      resolve(value);
    }

    cancelBtn.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    confirmBtn.addEventListener('click', () => close(true));
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        close(false);
      }
    });

    setTimeout(() => confirmBtn.focus(), 0);
  });
}
