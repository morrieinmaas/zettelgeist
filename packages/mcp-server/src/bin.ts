#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { makeServer, type AnyTool } from './server.js';
import {
  listSpecsTool, readSpecTool, readSpecFileTool, validateRepoTool,
} from './tools/read.js';
import {
  writeSpecFileTool, writeHandoffTool,
  tickTaskTool, untickTaskTool, setStatusTool,
} from './tools/write.js';
import {
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
} from './tools/state.js';
import {
  prepareSynthesisContextTool, writeArtifactTool,
} from './tools/synthesis.js';

const tools: AnyTool[] = [
  listSpecsTool, readSpecTool, readSpecFileTool, validateRepoTool,
  writeSpecFileTool, writeHandoffTool,
  tickTaskTool, untickTaskTool, setStatusTool,
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
  prepareSynthesisContextTool, writeArtifactTool,
] as AnyTool[];

async function main(): Promise<void> {
  const server = makeServer(tools, { cwd: process.cwd() });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('zettelgeist-mcp fatal:', err);
  process.exit(1);
});
