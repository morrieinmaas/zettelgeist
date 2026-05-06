import matter from 'gray-matter';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
  error: { code: 'E_INVALID_FRONTMATTER'; detail: string } | null;
}

export function parseFrontmatter(text: string): FrontmatterResult {
  try {
    const parsed = matter(text);
    return {
      data: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content,
      error: null,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      data: {},
      body: text,
      error: { code: 'E_INVALID_FRONTMATTER', detail },
    };
  }
}
