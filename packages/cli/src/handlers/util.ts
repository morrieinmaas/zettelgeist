import type { IncomingMessage, ServerResponse } from 'node:http';
import * as path from 'node:path';

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathTraversalError';
  }
}

/**
 * Resolves a path under a parent dir and asserts it stays within the parent.
 * Throws PathTraversalError if the resolved path escapes (handles `..`,
 * absolute paths; symlinks are still a runtime concern but path-level
 * traversal is blocked).
 */
export function safeJoin(parentDir: string, ...segments: string[]): string {
  const resolved = path.resolve(parentDir, ...segments);
  const parent = path.resolve(parentDir);
  if (resolved !== parent && !resolved.startsWith(parent + path.sep)) {
    throw new PathTraversalError(`path escapes ${parent}: ${resolved}`);
  }
  return resolved;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export function sendText(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'Content-Type': `${contentType}; charset=utf-8` });
  res.end(body);
}

export function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, { ok: false, error: { message: 'not found' } });
}

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
