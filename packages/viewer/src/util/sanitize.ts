import DOMPurify, { type Config } from 'dompurify';

const PURIFY_CONFIG: Config = {
  // Allow common markdown-rendered tags + mermaid SVGs
  ALLOWED_TAGS: [
    'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong',
    'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
    // mermaid renders SVG; allow a permissive SVG subset
    'svg', 'g', 'path', 'rect', 'circle', 'line', 'text', 'tspan', 'polygon',
    'polyline', 'defs', 'marker', 'clippath', 'foreignobject',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'data-spec', 'data-status',
    // svg attributes
    'd', 'fill', 'stroke', 'stroke-width', 'transform', 'viewBox', 'width',
    'height', 'x', 'y', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points',
    'marker-end', 'marker-start', 'clip-path', 'preserveaspectratio',
  ],
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
