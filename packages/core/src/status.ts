import type { RepoState, Spec, Status, Task } from './types.js';

function isCounted(task: Task): boolean {
  return !task.tags.includes('#skip');
}

export function deriveStatus(spec: Spec, repo: RepoState): Status {
  if (spec.frontmatter.status === 'cancelled') return 'cancelled';
  if (spec.frontmatter.status === 'blocked') return 'blocked';

  const counted = spec.tasks.filter(isCounted);
  const claimed = repo.claimedSpecs.has(spec.name);
  const merged = repo.mergedSpecs.has(spec.name);

  if (counted.length === 0) {
    // No counted tasks. A live claim still bumps to in-progress.
    return claimed ? 'in-progress' : 'draft';
  }

  const allChecked = counted.every((t) => t.checked);
  const anyChecked = counted.some((t) => t.checked);

  if (allChecked) return merged ? 'done' : 'in-review';
  if (anyChecked || claimed) return 'in-progress';
  return 'planned';
}
