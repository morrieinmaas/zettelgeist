import { parseInvocation } from './router.js';
import { emit, realEmitContext } from './output.js';

const HELP = `zettelgeist v0.1

Usage:
  zettelgeist <command> [options]

Commands:
  regen [--check]                regenerate specs/INDEX.md
  validate                       validate the repo against the spec
  install-hook [--force]         install pre-commit hook
  serve [--port N] [--no-open]   serve the viewer over HTTP
  export-doc <path> [--template T]  render markdown to HTML

Global flags:
  --json     emit machine-readable JSON envelope
  -h, --help show this help
`;

async function main(): Promise<number> {
  const inv = parseInvocation(process.argv.slice(2));

  if (inv.kind === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (inv.kind === 'unknown-command') {
    process.stderr.write(`unknown command: ${inv.name}\n${HELP}`);
    return 2;
  }

  const ctx = realEmitContext(inv.flags.json);
  const cwd = process.cwd();

  switch (inv.name) {
    case 'regen': {
      const { regenCommand } = await import('./commands/regen.js');
      const env = await regenCommand({ path: cwd, check: inv.flags.check ?? false });
      emit(ctx, env, () =>
        env.ok
          ? env.data.changed
            ? `regen: wrote ${env.data.path}`
            : `regen: ${env.data.path} up to date${env.data.cacheHit ? ' (cache hit)' : ''}`
          : '',
      );
      return env.ok ? 0 : 1;
    }
    case 'validate': {
      const { validateCommand } = await import('./commands/validate.js');
      const env = await validateCommand({ path: cwd });
      emit(ctx, env, () => 'validate: ok');
      return env.ok ? 0 : 1;
    }
    case 'install-hook': {
      const { installHookCommand } = await import('./commands/install-hook.js');
      const env = await installHookCommand({ path: cwd, force: inv.flags.force ?? false });
      emit(ctx, env, () =>
        env.ok ? `install-hook: installed${env.data.backup ? ` (backup: ${env.data.backup})` : ''}` : '',
      );
      return env.ok ? 0 : 1;
    }
    case 'serve': {
      const { serveCommand } = await import('./commands/serve.js');
      const port = inv.flags.port ? Number.parseInt(inv.flags.port, 10) : 7681;
      const env = await serveCommand({ path: cwd, port, noOpen: inv.flags['no-open'] ?? false });
      emit(ctx, env, () => (env.ok ? `serve: stopped` : ''));
      return env.ok ? 0 : 1;
    }
    case 'export-doc': {
      const { exportDocCommand } = await import('./commands/export-doc.js');
      const source = inv.args[0];
      if (!source) {
        process.stderr.write('export-doc: missing source path\n');
        return 2;
      }
      const env = await exportDocCommand({
        cwd,
        source,
        ...(inv.flags.template ? { templatePath: inv.flags.template } : {}),
      });
      emit(ctx, env, () => (env.ok ? `export-doc: wrote ${env.data.output}` : ''));
      return env.ok ? 0 : 1;
    }
    default:
      process.stderr.write(`unhandled command: ${inv.name}\n`);
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`zettelgeist: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
