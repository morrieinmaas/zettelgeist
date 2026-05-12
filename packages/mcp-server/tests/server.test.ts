import { describe, expect, it } from 'vitest';
import { makeServer, type AnyTool, type PromptDef } from '../src/server.js';

const noTools: AnyTool[] = [];

describe('makeServer capability advertisement', () => {
  it('advertises only tools capability when no prompts are passed', () => {
    const server = makeServer(noTools, { cwd: '/tmp' });
    // The MCP SDK stores capabilities on the internal _serverInfo; we can
    // exercise the public surface by checking that prompts/list throws (no
    // handler registered when prompts capability is absent).
    const caps = (server as unknown as { _capabilities?: Record<string, unknown> })._capabilities;
    expect(caps).toBeDefined();
    expect(caps).toHaveProperty('tools');
    expect(caps).not.toHaveProperty('prompts');
  });

  it('advertises prompts capability when prompts are passed', () => {
    const prompts: PromptDef[] = [
      { name: 'p1', description: 'a prompt', content: 'hello' },
    ];
    const server = makeServer(noTools, { cwd: '/tmp' }, { prompts });
    const caps = (server as unknown as { _capabilities?: Record<string, unknown> })._capabilities;
    expect(caps).toBeDefined();
    expect(caps).toHaveProperty('tools');
    expect(caps).toHaveProperty('prompts');
  });

  it('treats an empty prompts array the same as omitting prompts', () => {
    const server = makeServer(noTools, { cwd: '/tmp' }, { prompts: [] });
    const caps = (server as unknown as { _capabilities?: Record<string, unknown> })._capabilities;
    expect(caps).not.toHaveProperty('prompts');
  });
});
