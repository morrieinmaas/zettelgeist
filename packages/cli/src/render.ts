import { marked } from 'marked';

export function renderMarkdownBody(markdown: string): string {
  // Configure marked: GFM, no eval, no auto-IDs (deterministic)
  marked.setOptions({ gfm: true, breaks: false });
  return marked.parse(markdown) as string;
}

export interface MustacheContext {
  content: string;
  title: string;
  generated_at: string;
  tool_version: string;
  frontmatter: Record<string, unknown>;
}

const KNOWN_PLACEHOLDERS = ['content', 'title', 'generated_at', 'tool_version'] as const;
const FRONTMATTER_PREFIX = 'frontmatter.';

/** Render a mustache-style template. STRICT: unknown placeholders throw. */
export function renderTemplate(template: string, context: MustacheContext): string {
  const placeholderRe = /\{\{([^{}]+)\}\}/g;
  const seen = new Set<string>();
  return template.replace(placeholderRe, (match, rawKey: string) => {
    const key = rawKey.trim();
    seen.add(key);
    if ((KNOWN_PLACEHOLDERS as readonly string[]).includes(key)) {
      const v = context[key as keyof MustacheContext];
      if (typeof v === 'string') return v;
    }
    if (key.startsWith(FRONTMATTER_PREFIX)) {
      const fmKey = key.slice(FRONTMATTER_PREFIX.length);
      const v = context.frontmatter[fmKey];
      return v === undefined ? '' : String(v);
    }
    throw new Error(
      `unknown template placeholder "{{${key}}}". ` +
      `Valid placeholders: ${KNOWN_PLACEHOLDERS.join(', ')}, frontmatter.<key>`
    );
  });
}

/** Validate template before rendering — surfaces all unknown placeholders at once. */
export function validateTemplate(template: string): string[] {
  const placeholderRe = /\{\{([^{}]+)\}\}/g;
  const errors: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = placeholderRe.exec(template)) !== null) {
    const key = match[1]?.trim() ?? '';
    if ((KNOWN_PLACEHOLDERS as readonly string[]).includes(key)) continue;
    if (key.startsWith(FRONTMATTER_PREFIX)) continue;
    errors.push(`unknown placeholder: {{${key}}}`);
  }
  return errors;
}
