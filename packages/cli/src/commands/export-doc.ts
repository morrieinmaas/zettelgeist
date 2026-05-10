import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';
import { renderMarkdownBody, renderTemplate, validateTemplate, type MustacheContext } from '../render.js';

export interface ExportDocInput {
  cwd: string;             // repo root (or any cwd)
  source: string;          // path (relative to cwd) of markdown to export
  templatePath?: string;   // optional override
}

export interface ExportDocOk {
  output: string;          // path of the produced HTML file
}

const TOOL_VERSION = '0.1.0';

async function loadDefaultTemplate(): Promise<string> {
  // Templates are bundled into dist/templates at build time. At runtime, locate them
  // relative to this module file.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, '..', 'templates', 'export.html'),       // when running from dist/commands/
    path.join(here, '..', '..', 'templates', 'export.html'), // when running from src/commands/ via vite/test
  ];
  for (const c of candidates) {
    try { return await fs.readFile(c, 'utf8'); } catch {}
  }
  throw new Error('default export template not found');
}

export async function exportDocCommand(input: ExportDocInput): Promise<Envelope<ExportDocOk>> {
  const sourceAbs = path.resolve(input.cwd, input.source);
  let raw: string;
  try {
    raw = await fs.readFile(sourceAbs, 'utf8');
  } catch (err) {
    return errorEnvelope(`cannot read source: ${(err as Error).message}`);
  }

  const parsed = matter(raw, {});
  const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
  const body = parsed.content;

  // Extract title: from frontmatter.title, then first H1, then filename
  let title: string;
  if (typeof frontmatter.title === 'string') {
    title = frontmatter.title;
  } else {
    const h1 = body.match(/^#\s+(.+)$/m);
    title = h1?.[1]?.trim() ?? path.basename(sourceAbs);
  }

  let template: string;
  if (input.templatePath) {
    try {
      template = await fs.readFile(path.resolve(input.cwd, input.templatePath), 'utf8');
    } catch (err) {
      return errorEnvelope(`cannot read template: ${(err as Error).message}`);
    }
  } else {
    template = await loadDefaultTemplate();
  }

  const tmplErrors = validateTemplate(template);
  if (tmplErrors.length > 0) {
    return errorEnvelope(`template has ${tmplErrors.length} unknown placeholder(s)`, { errors: tmplErrors });
  }

  const context: MustacheContext = {
    content: renderMarkdownBody(body),
    title,
    generated_at: new Date().toISOString(),
    tool_version: TOOL_VERSION,
    frontmatter,
  };

  let html: string;
  try {
    html = renderTemplate(template, context);
  } catch (err) {
    return errorEnvelope((err as Error).message);
  }

  // Output goes under .zettelgeist/exports/ keyed by the source basename
  const outDir = path.join(input.cwd, '.zettelgeist', 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const baseName = path.basename(input.source, path.extname(input.source)) + '.html';
  const outPath = path.join(outDir, baseName);
  const tmp = `${outPath}.tmp`;
  await fs.writeFile(tmp, html, 'utf8');
  await fs.rename(tmp, outPath);

  return okEnvelope({ output: path.relative(input.cwd, outPath) });
}
