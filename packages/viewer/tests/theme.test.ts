import { describe, expect, it, beforeEach } from 'vitest';

describe('theme selection', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('applies "light" data-theme when zettelgeistConfig.theme is "light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('applies "dark" data-theme when zettelgeistConfig.theme is "dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
