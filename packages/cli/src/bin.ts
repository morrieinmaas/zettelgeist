import { parseInvocation } from './router.js';
import { emit, realEmitContext } from './output.js';
import { HELP as REGEN_HELP } from './commands/regen.js';
import { HELP as VALIDATE_HELP } from './commands/validate.js';
import { HELP as INSTALL_HOOK_HELP } from './commands/install-hook.js';
import { HELP as INSTALL_SKILL_HELP } from './commands/install-skill.js';
import { HELP as SERVE_HELP } from './commands/serve.js';
import { HELP as EXPORT_DOC_HELP } from './commands/export-doc.js';
import { HELP as MERGE_DRIVER_HELP } from './commands/merge-driver.js';
import { HELP as SYNC_HELP } from './commands/sync.js';
import { HELP as TUI_HELP } from './commands/tui.js';

// Replaced at bundle time via esbuild's `define` (see scripts/bundle.mjs).
declare const __ZG_CLI_VERSION__: string;

const HELP = `zettelgeist v${__ZG_CLI_VERSION__}

Usage:
  zettelgeist <command> [options]

Commands:
  regen [--check]                regenerate specs/INDEX.md
  validate                       validate the repo against the spec
  install-hook [--force]         install pre-commit hook
  install-skill [--scope S]      install the agent skill (Claude Code etc.)
  serve [--port N] [--no-open]   serve the viewer over HTTP
  sync [--check]                 fetch + rebase, auto-resolve managed conflicts
  tui  [--view=NAME]             open the terminal UI (requires @zettelgeist/tui)
  export-doc <path> [--template T]  render markdown to HTML

Global flags:
  --json     emit machine-readable JSON envelope
  -h, --help show this help

Run \`zettelgeist <command> --help\` for command-specific help.
`;

const COMMAND_HELP: Record<string, string> = {
  regen: REGEN_HELP,
  validate: VALIDATE_HELP,
  'install-hook': INSTALL_HOOK_HELP,
  'install-skill': INSTALL_SKILL_HELP,
  serve: SERVE_HELP,
  'export-doc': EXPORT_DOC_HELP,
  'merge-driver': MERGE_DRIVER_HELP,
  sync: SYNC_HELP,
  tui: TUI_HELP,
};

async function main(): Promise<number> {
  // `--version` short-circuits before the router so it works without
  // configuring it as a "command" (matches the convention every other
  // npm CLI follows).
  const argv = process.argv.slice(2);
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`zettelgeist ${__ZG_CLI_VERSION__}\n`);
    return 0;
  }

  const inv = parseInvocation(argv);

  if (inv.kind === 'help') {
    const text = (inv.topic && COMMAND_HELP[inv.topic]) || HELP;
    process.stdout.write(text);
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
    case 'install-skill': {
      const { installSkillCommand, isScope } = await import('./commands/install-skill.js');
      const scopeRaw = inv.flags.scope ?? 'user';
      if (!isScope(scopeRaw)) {
        process.stderr.write(
          `install-skill: --scope must be 'user', 'project', or 'agents-md' (got '${scopeRaw}')\n`,
        );
        return 2;
      }
      const env = await installSkillCommand({
        cwd,
        scope: scopeRaw,
        force: inv.flags.force ?? false,
      });
      emit(ctx, env, () =>
        env.ok
          ? `install-skill: ${env.data.merged ? 'merged into' : 'wrote'} ${env.data.path}`
          : '',
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
    case 'sync': {
      const { syncCommand } = await import('./commands/sync.js');
      const env = await syncCommand({
        cwd,
        check: inv.flags.check ?? false,
        ...(inv.flags['allow-dirty'] ? { allowDirty: true } : {}),
      });
      emit(ctx, env, () => {
        if (!env.ok) return '';
        const { status, commitsBehind, commitsAhead, indexRegenerated, indexCommitFailed } = env.data;
        const counts = `behind=${commitsBehind}, ahead=${commitsAhead}`;
        const extras: string[] = [];
        if (indexRegenerated) extras.push('INDEX regenerated');
        if (indexCommitFailed) extras.push('WARNING: INDEX regen commit failed — working tree may be dirty');
        const tail = extras.length > 0 ? `, ${extras.join(', ')}` : '';
        return `sync: ${status} (${counts}${tail})`;
      });
      if (!env.ok) return 1;
      // --check semantics: exit non-zero when a sync is needed OR repo isn't ready.
      if (inv.flags.check && ['needs-sync', 'no-upstream', 'not-a-repo', 'detached-head'].includes(env.data.status)) {
        return 1;
      }
      // If the regen-commit step failed during a real sync, the working tree
      // is left with a modified INDEX.md. Surface this as a failed exit.
      if (env.data.indexCommitFailed) return 1;
      return 0;
    }
    case 'tui': {
      const { tuiCommand } = await import('./commands/tui.js');
      const env = await tuiCommand({
        cwd,
        ...(inv.flags.view ? { view: inv.flags.view } : {}),
      });
      emit(ctx, env, () =>
        env.ok ? `tui: ${env.data.binary} exited ${env.data.exitCode}` : '',
      );
      if (!env.ok) return 1;
      return env.data.exitCode;
    }
    case 'merge-driver': {
      const { mergeDriverCommand, isMergeDriverKind } = await import('./commands/merge-driver.js');
      const [kind, basePath, oursPath, theirsPath] = inv.args;
      if (!kind || !basePath || !oursPath || !theirsPath) {
        process.stderr.write('merge-driver: expected <kind> <base> <ours> <theirs>\n');
        return 2;
      }
      if (!isMergeDriverKind(kind)) {
        process.stderr.write(
          `merge-driver: unknown kind '${kind}' (supported: tasks, frontmatter)\n`,
        );
        return 2;
      }
      const env = await mergeDriverCommand({ kind, basePath, oursPath, theirsPath });
      emit(ctx, env, () =>
        env.ok
          ? env.data.cleanlyResolved
            ? `merge-driver: resolved ${env.data.kind} → ${env.data.outputPath}`
            : `merge-driver: ${env.data.kind} had conflicts; wrote markers to ${env.data.outputPath}`
          : '',
      );
      if (!env.ok) return 1;
      // Per git's merge-driver contract: exit 0 = clean resolution, exit
      // non-zero = conflict markers in the file. Surface this so git records
      // the file as conflicted and rebase/merge stops for the user.
      return env.data.cleanlyResolved ? 0 : 1;
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
