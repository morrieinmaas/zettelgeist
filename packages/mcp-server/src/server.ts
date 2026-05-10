import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ToolContext {
  cwd: string;
}

export interface ToolDef<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<I>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

// Heterogeneous tool array — each tool has its own I/O types
export type AnyTool = ToolDef<unknown, unknown>;

export function makeServer(tools: AnyTool[], ctx: ToolContext): Server {
  const server = new Server(
    { name: 'zettelgeist', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }) as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      throw new Error(`unknown tool: ${req.params.name}`);
    }
    const args = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.handler(args, ctx);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  });

  return server;
}
