import type { Task } from './types.js';

const TASK_LINE = /^[\s>]*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const NUMERIC_PREFIX = /^\d+\.\s+/;
const KNOWN_TAGS = new Set(['#human-only', '#agent-only', '#skip']);

export function parseTasks(body: string): Task[] {
  const tasks: Task[] = [];
  const lines = body.split('\n');
  let index = 0;
  for (const line of lines) {
    const m = line.match(TASK_LINE);
    if (!m) continue;
    index += 1;
    const checked = m[1] !== ' ';
    let text = (m[2] ?? '').trim();
    text = text.replace(NUMERIC_PREFIX, '');

    const tags: Array<Task['tags'][number]> = [];
    const seen = new Set<string>();
    for (const word of text.split(/\s+/)) {
      if (KNOWN_TAGS.has(word) && !seen.has(word)) {
        tags.push(word as Task['tags'][number]);
        seen.add(word);
      }
    }

    // Strip the trailing tags from the text so it reads cleanly.
    const cleanedWords = text.split(/\s+/).filter((w) => !KNOWN_TAGS.has(w));
    text = cleanedWords.join(' ').trim();

    tasks.push({ index, checked, text, tags });
  }
  return tasks;
}
