import { describe, expect, it } from 'vitest';

// The extension's interesting behavior (webview HTML rewriting, the postMessage
// shim, the backend mutations) is only meaningful inside a real VSCode host —
// covered by manual testing in the Extension Development Host. This smoke test
// just verifies the module's exports compile and resolve so CI catches obvious
// regressions on the workspace install.

describe('vscode-extension smoke', () => {
  it('package.json has the expected commands declared', async () => {
    const pkg = (await import('../package.json', { with: { type: 'json' } })) as {
      default: { contributes: { commands: Array<{ command: string }> } };
    };
    const commands = pkg.default.contributes.commands.map((c) => c.command);
    expect(commands).toContain('zettelgeist.open');
    expect(commands).toContain('zettelgeist.regen');
    expect(commands).toContain('zettelgeist.installHook');
  });
});
