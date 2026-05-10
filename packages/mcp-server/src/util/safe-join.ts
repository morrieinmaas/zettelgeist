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
