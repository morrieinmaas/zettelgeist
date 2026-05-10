export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; detail?: unknown } };

export interface EmitContext {
  json: boolean;
  writeStdout: (s: string) => void;
  writeStderr: (s: string) => void;
}

export function okEnvelope<T>(data: T): Envelope<T> {
  return { ok: true, data };
}

export function errorEnvelope(message: string, detail?: unknown): Envelope<never> {
  if (detail === undefined) return { ok: false, error: { message } };
  return { ok: false, error: { message, detail } };
}

export function emit<T>(
  ctx: EmitContext,
  env: Envelope<T>,
  humanRender: () => string,
): void {
  if (ctx.json) {
    ctx.writeStdout(JSON.stringify(env) + '\n');
    return;
  }
  if (env.ok) {
    ctx.writeStdout(humanRender() + '\n');
  } else {
    ctx.writeStderr(`error: ${env.error.message}\n`);
  }
}

export const realEmitContext = (json: boolean): EmitContext => ({
  json,
  writeStdout: (s) => process.stdout.write(s),
  writeStderr: (s) => process.stderr.write(s),
});
