import { validateRepo, loadConfig, type ValidationError } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';
import { okEnvelope, errorEnvelope, type Envelope } from '../output.js';

export const HELP = `zettelgeist validate [--json]

  Validate the current repo against the Zettelgeist format spec.

  Reports a non-zero exit code if any validation errors are found.

  Flags:
    --json         Emit a machine-readable JSON envelope (with the full
                   error list under .data.errors).
`;

export interface ValidateInput { path: string; }
export interface ValidateOk { errors: ValidationError[]; }

export async function validateCommand(input: ValidateInput): Promise<Envelope<ValidateOk>> {
  const reader = makeDiskFsReader(input.path);
  if (!(await reader.exists('.zettelgeist.yaml'))) {
    return errorEnvelope(`not a zettelgeist repo: ${input.path}`);
  }
  const cfg = await loadConfig(reader);
  const validation = await validateRepo(reader, cfg.config.specsDir);
  const allErrors = [...cfg.errors, ...validation.errors];
  if (allErrors.length === 0) return okEnvelope({ errors: [] });
  const count = allErrors.length;
  return errorEnvelope(
    `${count} validation error${count === 1 ? '' : 's'}`,
    { errors: allErrors },
  );
}
