import { parseArgs } from 'node:util';

export interface CommandFlags {
  json: boolean;
  help: boolean;
  check?: boolean;
  force?: boolean;
  port?: string;
  'no-open'?: boolean;
  template?: string;
  scope?: string;
}

export type Invocation =
  | {
      kind: 'command';
      name: string;
      args: string[];
      flags: CommandFlags;
    }
  | { kind: 'help'; topic: string | null }
  | { kind: 'unknown-command'; name: string };

const KNOWN_COMMANDS = new Set([
  'regen',
  'validate',
  'install-hook',
  'install-skill',
  'serve',
  'export-doc',
  'merge-driver',
  'sync',
]);

const FLAG_OPTIONS = {
  json:      { type: 'boolean' as const },
  help:      { type: 'boolean' as const, short: 'h' },
  check:     { type: 'boolean' as const },
  force:     { type: 'boolean' as const },
  port:      { type: 'string'  as const },
  'no-open': { type: 'boolean' as const },
  template:  { type: 'string'  as const },
  scope:     { type: 'string'  as const },
};

export function parseInvocation(argv: string[]): Invocation {
  if (argv.length === 0) return { kind: 'help', topic: null };
  if (argv[0] === '--help' || argv[0] === '-h') return { kind: 'help', topic: null };

  const [first, ...rest] = argv;
  if (!first) return { kind: 'help', topic: null };
  if (!KNOWN_COMMANDS.has(first)) return { kind: 'unknown-command', name: first };

  if (rest.includes('--help') || rest.includes('-h')) {
    return { kind: 'help', topic: first };
  }

  const { values, positionals } = parseArgs({
    args: rest,
    options: FLAG_OPTIONS,
    allowPositionals: true,
  });

  const flags: CommandFlags = {
    json: values.json ?? false,
    help: values.help ?? false,
    ...(values.check !== undefined ? { check: values.check } : {}),
    ...(values.force !== undefined ? { force: values.force } : {}),
    ...(values.port !== undefined ? { port: values.port } : {}),
    ...(values['no-open'] !== undefined ? { 'no-open': values['no-open'] } : {}),
    ...(values.template !== undefined ? { template: values.template } : {}),
    ...(values.scope !== undefined ? { scope: values.scope } : {}),
  };

  return { kind: 'command', name: first, args: positionals, flags };
}
