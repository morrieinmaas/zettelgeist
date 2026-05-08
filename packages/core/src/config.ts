import yaml from 'js-yaml';
import type { FsReader } from './loader.js';
import type { ValidationError } from './types.js';

const CONFIG_PATH = '.zettelgeist.yaml';

export interface ZettelgeistConfig {
  /** null when missing or wrong-type. */
  formatVersion: string | null;
  /** Defaults to 'specs'. */
  specsDir: string;
}

export interface LoadConfigResult {
  config: ZettelgeistConfig;
  errors: ValidationError[];
}

/**
 * Reads and parses `.zettelgeist.yaml`. Caller must verify the file exists.
 *
 * Emits `E_INVALID_FRONTMATTER` errors against `.zettelgeist.yaml` when:
 *   - YAML fails to parse
 *   - `format_version` is missing or not a string
 *   - `specs_dir` is present but not a string (falls back to default)
 */
export async function loadConfig(fs: FsReader): Promise<LoadConfigResult> {
  const errors: ValidationError[] = [];
  const defaults: ZettelgeistConfig = { formatVersion: null, specsDir: 'specs' };

  const raw = await fs.readFile(CONFIG_PATH);

  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    errors.push({ code: 'E_INVALID_FRONTMATTER', path: CONFIG_PATH, detail });
    return { config: defaults, errors };
  }

  // YAML `null` (empty file) → treat as empty object.
  const obj: Record<string, unknown> =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  const fv = obj['format_version'];
  let formatVersion: string | null = null;
  if (typeof fv === 'string') {
    formatVersion = fv;
  } else {
    errors.push({
      code: 'E_INVALID_FRONTMATTER',
      path: CONFIG_PATH,
      detail: 'format_version must be a string',
    });
  }

  let specsDir = 'specs';
  if ('specs_dir' in obj) {
    const sd = obj['specs_dir'];
    if (typeof sd === 'string') {
      specsDir = sd;
    } else {
      errors.push({
        code: 'E_INVALID_FRONTMATTER',
        path: CONFIG_PATH,
        detail: 'specs_dir must be a string',
      });
    }
  }

  return { config: { formatVersion, specsDir }, errors };
}
