import DOMPurify, { type Config } from 'dompurify';

// Allow markdown-rendered HTML + Mermaid-produced SVG. DOMPurify's HTML+SVG
// profiles cover everything Mermaid emits (style, font-*, text-anchor, marker
// sizing, etc.) while still stripping <script>, event handlers, and other
// XSS vectors at the core level regardless of profile.
const PURIFY_CONFIG: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  // Allow <input type="checkbox" disabled> for GFM task-list rendering and
  // the `task-list-item` / `contains-task-list` classes marked emits.
  ADD_TAGS: ['input'],
  ADD_ATTR: ['data-spec', 'data-status', 'type', 'checked', 'disabled', 'class'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

/** Sanitize HTML produced by marked or any other source before innerHTML assignment. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as string;
}

/** Escape a plain string for safe insertion into HTML text nodes / attributes. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] ?? c);
}
