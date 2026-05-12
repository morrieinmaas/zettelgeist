import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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

export interface PromptDef {
  name: string;
  description: string;
  /** Static content returned for `prompts/get`. */
  content: string;
}

// Heterogeneous tool array — each tool has its own I/O types
export type AnyTool = ToolDef<unknown, unknown>;

export interface ServerOptions {
  prompts?: PromptDef[];
}

export function makeServer(
  tools: AnyTool[],
  ctx: ToolContext,
  options: ServerOptions = {},
): Server {
  const prompts = options.prompts ?? [];
  const capabilities: Record<string, Record<string, unknown>> = { tools: {} };
  if (prompts.length > 0) capabilities['prompts'] = {};

  const server = new Server(
    { name: 'zettelgeist', version: '0.1.0' },
    { capabilities },
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

  if (prompts.length > 0) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: prompts.map((p) => ({ name: p.name, description: p.description })),
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (req) => {
      const prompt = prompts.find((p) => p.name === req.params.name);
      if (!prompt) throw new Error(`unknown prompt: ${req.params.name}`);
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: prompt.content },
          },
        ],
      };
    });
  }

  return server;
}
