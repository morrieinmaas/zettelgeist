import type { ValidationError } from '../backend.js';
import { escapeHtml } from '../util/sanitize.js';

/**
 * Renders a dismissible banner listing validate_repo errors. Returns null if
 * there are no errors so callers can early-out cheaply.
 */
export function renderValidationBanner(errors: ValidationError[]): HTMLElement | null {
  if (errors.length === 0) return null;

  const banner = document.createElement('details');
  banner.className = 'zg-validation-banner';
  banner.open = errors.length <= 3;  // collapse when noisy; expanded when actionable

  const summary = document.createElement('summary');
  summary.className = 'zg-validation-summary';
  const icon = document.createElement('span');
  icon.className = 'zg-validation-icon';
  icon.textContent = '⚠';
  summary.appendChild(icon);
  const label = document.createElement('span');
  label.textContent =
    errors.length === 1
      ? '1 spec validation error'
      : `${errors.length} spec validation errors`;
  summary.appendChild(label);
  banner.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'zg-validation-list';
  for (const err of errors) {
    const li = document.createElement('li');
    li.className = `zg-validation-item zg-validation-${err.code.toLowerCase()}`;
    li.innerHTML =
      `<code>${escapeHtml(err.code)}</code> ` +
      `<strong>${escapeHtml(formatPath(err.path))}</strong>` +
      (err.detail ? ` — ${escapeHtml(err.detail)}` : '');
    list.appendChild(li);
  }
  banner.appendChild(list);

  return banner;
}

function formatPath(path: string | string[]): string {
  if (typeof path === 'string') return path;
  return path.join(' → ');
}

/**
 * Fetch + render in one call. Failures fetching are silent (don't block the
 * primary view); the banner just doesn't appear.
 */
export async function fetchAndRenderValidationBanner(): Promise<HTMLElement | null> {
  try {
    const { errors } = await window.zettelgeistBackend.validateRepo();
    return renderValidationBanner(errors);
  } catch {
    return null;
  }
}
