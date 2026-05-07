import { buildGraph } from './graph.js';
import { parseFrontmatter } from './frontmatter.js';
import type { FsReader } from './loader.js';
import { folderContainsMarkdown, loadAllSpecs } from './loader.js';
import type { ValidationError } from './types.js';

export async function validateRepo(
  fs: FsReader,
  specsDir = 'specs',
): Promise<{ errors: ValidationError[] }> {
  const errors: ValidationError[] = [];

  if (!(await fs.exists(specsDir))) {
    return { errors };
  }

  // Detect E_EMPTY_SPEC by walking entries directly: a folder under specs/ with no .md files anywhere.
  const entries = await fs.readDir(specsDir);
  for (const e of entries) {
    if (!e.isDir) continue;
    const hasMarkdown = await folderContainsMarkdown(fs, `${specsDir}/${e.name}`);
    if (!hasMarkdown) {
      errors.push({ code: 'E_EMPTY_SPEC', path: `${specsDir}/${e.name}` });
    }
  }

  // E_INVALID_FRONTMATTER on requirements.md (if present).
  for (const e of entries) {
    if (!e.isDir) continue;
    const reqPath = `${specsDir}/${e.name}/requirements.md`;
    if (!(await fs.exists(reqPath))) continue;
    const raw = await fs.readFile(reqPath);
    const parsed = parseFrontmatter(raw);
    if (parsed.error) {
      errors.push({ code: 'E_INVALID_FRONTMATTER', path: reqPath, detail: parsed.error.detail });
    }
  }

  // E_CYCLE from the graph.
  const specs = await loadAllSpecs(fs, specsDir);
  const graph = buildGraph(specs);
  for (const cycle of graph.cycles) {
    errors.push({ code: 'E_CYCLE', path: cycle });
  }

  errors.sort(compareErrors);
  return { errors };
}

function compareErrors(a: ValidationError, b: ValidationError): number {
  if (a.code !== b.code) return a.code.localeCompare(b.code);
  const aPath = Array.isArray(a.path) ? a.path.join('|') : a.path;
  const bPath = Array.isArray(b.path) ? b.path.join('|') : b.path;
  return aPath.localeCompare(bPath);
}
