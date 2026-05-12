import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { makeServer, type AnyTool, type PromptDef } from './server.js';
import {
  listSpecsTool, readSpecTool, readSpecFileTool, validateRepoTool,
} from './tools/read.js';
import {
  writeSpecFileTool, writeHandoffTool,
  tickTaskTool, untickTaskTool, setStatusTool, patchFrontmatterTool,
} from './tools/write.js';
import {
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
} from './tools/state.js';
import {
  prepareSynthesisContextTool, writeArtifactTool,
} from './tools/synthesis.js';
import { skillBody } from './skill.js';

const tools: AnyTool[] = [
  listSpecsTool, readSpecTool, readSpecFileTool, validateRepoTool,
  writeSpecFileTool, writeHandoffTool,
  tickTaskTool, untickTaskTool, setStatusTool, patchFrontmatterTool,
  claimSpecTool, releaseSpecTool, regenerateIndexTool, installGitHookTool,
  prepareSynthesisContextTool, writeArtifactTool,
] as AnyTool[];

const prompts: PromptDef[] = [
  {
    name: 'zettelgeist-workflow',
    description:
      'Workflow guide for using Zettelgeist: claim → read → mutate → handoff → release, plus v0.1 format rules.',
    content: skillBody(),
  },
];

async function main(): Promise<void> {
  const server = makeServer(tools, { cwd: process.cwd() }, { prompts });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('zettelgeist-mcp fatal:', err);
  process.exit(1);
});
