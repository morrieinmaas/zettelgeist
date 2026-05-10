import { describe, expect, it, beforeEach } from 'vitest';
import { showReasonModal } from '../../src/components/reason-modal.js';

describe('showReasonModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the trimmed reason on confirm', async () => {
    const promise = showReasonModal({
      title: 'Test', message: 'Why?', reasonRequired: true,
      reasonLabel: 'Reason:', confirmLabel: 'OK',
    });
    const textarea = document.querySelector('.zg-modal-textarea') as HTMLTextAreaElement;
    textarea.value = '  blocking reason  ';
    (document.querySelector('.zg-modal-confirm') as HTMLButtonElement).click();
    expect(await promise).toBe('blocking reason');
  });

  it('returns null on cancel', async () => {
    const promise = showReasonModal({
      title: 'Test', message: '', reasonRequired: false,
      reasonLabel: '', confirmLabel: 'OK',
    });
    (document.querySelector('.zg-modal-cancel') as HTMLButtonElement).click();
    expect(await promise).toBeNull();
  });

  it('rejects empty reason when required', async () => {
    const promise = showReasonModal({
      title: 'Test', message: '', reasonRequired: true,
      reasonLabel: '', confirmLabel: 'OK',
    });
    (document.querySelector('.zg-modal-confirm') as HTMLButtonElement).click();
    // Modal should still be open
    expect(document.querySelector('.zg-modal')).not.toBeNull();
    const error = document.querySelector('.zg-modal-error') as HTMLElement;
    expect(error.style.display).not.toBe('none');
    // Cancel to clean up
    (document.querySelector('.zg-modal-cancel') as HTMLButtonElement).click();
    expect(await promise).toBeNull();
  });

  it('removes the modal from DOM after close', async () => {
    const promise = showReasonModal({
      title: 'Test', message: '', reasonRequired: false,
      reasonLabel: '', confirmLabel: 'OK',
    });
    (document.querySelector('.zg-modal-cancel') as HTMLButtonElement).click();
    await promise;
    expect(document.querySelector('.zg-modal')).toBeNull();
    expect(document.querySelector('.zg-modal-overlay')).toBeNull();
  });
});
