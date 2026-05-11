import type { RepoState, Spec, Status, Task } from './types.js';

function isCounted(task: Task): boolean {
  return !task.tags.includes('#skip');
}

const VALID_STATUSES = new Set<Status>([
  'draft', 'planned', 'in-progress', 'in-review', 'done', 'blocked', 'cancelled',
]);

export function deriveStatus(spec: Spec, repo: RepoState): Status {
  // Frontmatter `status:` is an explicit override for ALL statuses, not just
  // blocked/cancelled. Board drag-to-column writes this field; ignoring the
  // override here would render those drags invisible (the card snaps back).
  const fm = spec.frontmatter.status;
  if (typeof fm === 'string' && VALID_STATUSES.has(fm as Status)) {
    return fm as Status;
  }

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
