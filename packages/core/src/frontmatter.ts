import matter from 'gray-matter';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
  error: { code: 'E_INVALID_FRONTMATTER'; detail: string } | null;
}

export function parseFrontmatter(text: string): FrontmatterResult {
  try {
    // Pass an options object to disable gray-matter's internal content-keyed cache,
    // which otherwise corrupts subsequent parses of the same input after a thrown
    // parse error (the file is cached pre-parse, so a second call returns the
    // partially-mutated cached entry without re-throwing).
    const parsed = matter(text, {});
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
