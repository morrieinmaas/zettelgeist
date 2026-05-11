import type { SpecDetail, SpecSummary } from '../backend.js';
import { renderTabs } from '../components/tabs.js';
import { renderTaskList } from '../components/task-list.js';
import { renderFrontmatterForm } from '../components/frontmatter-form.js';
import { renderMarkdownEditor, splitFrontmatter } from '../components/markdown-editor.js';
import { processWikiLinks } from '../util/wiki-links.js';
import { escapeHtml } from '../util/sanitize.js';

export async function renderDetail(params: Record<string, string>): Promise<void> {
  const app = document.getElementById('app')!;
  const name = params.name;
  if (!name) {
    app.innerHTML = '<p class="zg-error">Missing spec name in URL.</p>';
    return;
  }

  app.innerHTML = '<p>Loading…</p>';

  const backend = window.zettelgeistBackend;
  let spec: SpecDetail;
  let summary: SpecSummary | null = null;
  let knownSpecs: Set<string> = new Set();
  try {
    spec = await backend.readSpec(name);
    // Also pull the SpecSummary so we can display status/progress/PR/branch
    // in the header. Cheap — listSpecs is already O(N).
    const all = await backend.listSpecs();
    summary = all.find((s) => s.name === name) ?? null;
    knownSpecs = new Set(all.map((s) => s.name));
  } catch (err) {
    app.innerHTML = `<p class="zg-error">Failed to load spec "${escapeHtml(name)}": ${escapeHtml((err as Error).message)}</p>`;
    return;
  }

  // Single shared transform for every rendered markdown body in this view:
  // turn `[[spec-name]]` into clickable wiki-links, marking missing targets.
  const enrich = (root: HTMLElement): void => processWikiLinks(root, knownSpecs);

  app.innerHTML = '';
  const wrapper = document.createElement('article');
  wrapper.className = 'zg-detail';

  wrapper.appendChild(renderHeader(spec, summary));

  const tabs = [
    { id: 'requirements', label: 'Requirements', render: () => renderRequirementsTab(spec, enrich) },
    { id: 'tasks',        label: `Tasks (${spec.tasks.length})`, render: () => renderTasksTab(spec) },
    { id: 'handoff',      label: 'Handoff', render: () => renderHandoffTab(spec, enrich) },
  ];
  if (Object.keys(spec.lenses).length > 0) {
    tabs.push({ id: 'lenses', label: 'Lenses', render: () => renderLensesTab(spec, enrich) });
  }

  wrapper.appendChild(renderTabs(tabs));
  app.appendChild(wrapper);
}

function renderHeader(spec: SpecDetail, summary: SpecSummary | null): HTMLElement {
  const header = document.createElement('header');
  header.className = 'zg-detail-header';

  // Smart back link: return to whichever view referred us (board / graph),
  // not always the board. Falls back to the board when the user landed here
  // directly (typed URL, page reload, external link).
  const referrer = sessionStorage.getItem('zg:prev-route') ?? '#/';
  const back = document.createElement('a');
  back.href = referrer;
  back.textContent = referrer === '#/graph' ? '← Back to graph' : '← Back to board';
  back.className = 'zg-back-link';
  header.appendChild(back);

  const titleRow = document.createElement('div');
  titleRow.className = 'zg-detail-title-row';

  const title = document.createElement('h2');
  title.textContent = spec.name;
  titleRow.appendChild(title);

  if (summary) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'zg-detail-edit-btn';
    editBtn.textContent = '✎ Edit details';
    editBtn.addEventListener('click', async () => {
      const { showEditModal } = await import('../components/edit-modal.js');
      const saved = await showEditModal({ spec: summary });
      if (saved) window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    titleRow.appendChild(editBtn);
  }

  header.appendChild(titleRow);

  if (summary) header.appendChild(renderMeta(summary));

  return header;
}

function renderMeta(summary: SpecSummary): HTMLElement {
  const meta = document.createElement('div');
  meta.className = 'zg-detail-meta';

  // Status pill
  const status = document.createElement('span');
  status.className = `zg-status-pill zg-status-${summary.status}`;
  status.textContent = summary.status;
  meta.appendChild(status);

  // Progress (e.g. "2/5") with mini bar — same vocabulary as the card on
  // the board, so a user dropping in here knows what they're seeing.
  const { done, total } = parseProgress(summary.progress);
  const progressWrap = document.createElement('span');
  progressWrap.className = 'zg-detail-progress';
  progressWrap.textContent = `${summary.progress} tasks`;
  if (total > 0) {
    const bar = document.createElement('span');
    bar.className = 'zg-detail-progress-bar';
    const fill = document.createElement('span');
    fill.className = 'zg-detail-progress-fill';
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    bar.appendChild(fill);
    progressWrap.appendChild(bar);
  }
  meta.appendChild(progressWrap);

  if (summary.pr) {
    const a = document.createElement('a');
    a.className = 'zg-badge zg-badge-pr';
    a.href = summary.pr;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = prLabel(summary.pr);
    meta.appendChild(a);
  }
  if (summary.branch) {
    const span = document.createElement('span');
    span.className = 'zg-badge zg-badge-branch';
    span.textContent = summary.branch;
    meta.appendChild(span);
  }
  if (summary.worktree) {
    const span = document.createElement('span');
    span.className = 'zg-badge zg-badge-worktree';
    span.title = `worktree: ${summary.worktree}`;
    span.textContent = `📁 ${summary.worktree}`;
    meta.appendChild(span);
  }
  if (summary.blockedBy) {
    const span = document.createElement('span');
    span.className = 'zg-badge zg-badge-blocked';
    span.title = summary.blockedBy;
    span.textContent = `blocked: ${summary.blockedBy}`;
    meta.appendChild(span);
  }

  return meta;
}

function renderRequirementsTab(spec: SpecDetail, postRender: (el: HTMLElement) => void): HTMLElement {
  const container = document.createElement('div');
  container.appendChild(renderFrontmatterForm(spec));

  container.appendChild(
    renderMarkdownEditor({
      body: spec.requirements,
      emptyPlaceholder: `No requirements yet for "${spec.name}"`,
      emptyHint:
        'Write what this spec is for, the acceptance criteria, what\'s out of scope, ' +
        'and any references. Use `- [ ]` checkboxes for each acceptance criterion.',
      startingTemplate: REQUIREMENTS_TEMPLATE.replace('{NAME}', spec.name),
      postRender,
      interactiveCheckboxes: true,
      // requirements.md has frontmatter we must preserve on body-only edits.
      onSave: async (newBody) => {
        const backend = window.zettelgeistBackend;
        const file = await backend.readSpecFile(spec.name, 'requirements.md').catch(() => ({ content: '' }));
        const { frontmatter } = splitFrontmatter(file.content);
        const next = frontmatter + (newBody.startsWith('\n') ? newBody : `\n${newBody}`);
        await backend.writeSpecFile(spec.name, 'requirements.md', next);
      },
    }),
  );
  return container;
}

function renderTasksTab(spec: SpecDetail): HTMLElement {
  return renderTaskList(spec.name, spec.tasks);
}

function renderHandoffTab(spec: SpecDetail, postRender: (el: HTMLElement) => void): HTMLElement {
  return renderMarkdownEditor({
    body: spec.handoff,
    emptyPlaceholder: 'No handoff notes yet',
    emptyHint:
      'When you pause work on this spec, leave a note for the next person ' +
      '(or agent): what you did, what\'s next, and any open questions.',
    startingTemplate: HANDOFF_TEMPLATE,
    postRender,
    interactiveCheckboxes: true,
    onSave: async (newBody) => {
      await window.zettelgeistBackend.writeHandoff(spec.name, newBody);
    },
  });
}

const REQUIREMENTS_TEMPLATE = `# {NAME}

## Why

<!-- Why does this spec exist? What problem does it solve, for whom? -->

## Acceptance criteria

- [ ] WHEN <trigger>
- [ ] THE SYSTEM SHALL <observable behavior>
- [ ] AND <additional behavior>

## Out of scope

- <thing this spec deliberately doesn't cover>

## References

- <link or note>
`;

const HANDOFF_TEMPLATE = `## What I did

<!-- Concrete progress: code, decisions, dead ends. -->

## What's next

<!-- The most useful 1–3 things the next session should pick up. -->

## Open questions

<!-- Anything ambiguous that needs a human or another agent to weigh in. -->
`;

function renderLensesTab(spec: SpecDetail, postRender: (el: HTMLElement) => void): HTMLElement {
  const container = document.createElement('div');
  for (const [name, content] of Object.entries(spec.lenses)) {
    const heading = document.createElement('h3');
    heading.textContent = name;
    container.appendChild(heading);
    container.appendChild(
      renderMarkdownEditor({
        body: content,
        emptyPlaceholder: '(empty)',
        postRender,
        interactiveCheckboxes: true,
        onSave: async (newBody) => {
          await window.zettelgeistBackend.writeSpecFile(spec.name, `lenses/${name}.md`, newBody);
        },
      }),
    );
  }
  return container;
}

function parseProgress(s: string): { done: number; total: number } {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (!m) return { done: 0, total: 0 };
  return { done: Number(m[1]), total: Number(m[2]) };
}

function prLabel(url: string): string {
  const gh = /\/pull\/(\d+)/.exec(url);
  if (gh) return `PR #${gh[1]}`;
  return 'PR';
}
