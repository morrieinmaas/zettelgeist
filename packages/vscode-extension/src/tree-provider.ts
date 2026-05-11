import * as vscode from 'vscode';
import type { makeBackend } from './backend.js';

type Status = 'draft' | 'planned' | 'in-progress' | 'in-review' | 'done' | 'blocked' | 'cancelled';

const STATUS_ORDER: Status[] = [
  'in-progress', 'in-review', 'planned', 'draft', 'blocked', 'done', 'cancelled',
];

// Map each status to a VSCode codicon so the tree reads at a glance without
// shipping per-status icons. https://microsoft.github.io/vscode-codicons/
const STATUS_ICON: Record<Status, string> = {
  'draft':       'circle-outline',
  'planned':     'circle',
  'in-progress': 'sync',
  'in-review':   'eye',
  'done':        'pass-filled',
  'blocked':     'error',
  'cancelled':   'circle-slash',
};

interface SpecListItem {
  name: string;
  status: Status;
  progress: string;
  blockedBy: string | null;
}

abstract class TreeNode extends vscode.TreeItem {
  constructor(label: string, state: vscode.TreeItemCollapsibleState) {
    super(label, state);
  }
}

// Top-level "Views" section: jumps to the kanban board / dep graph / docs
// using the same routing the viewer would use in a browser. The webview is
// opened (or revealed) and navigated to the given hash.
class ViewsRoot extends TreeNode {
  constructor() {
    super('Views', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'zg.viewsRoot';
    this.iconPath = new vscode.ThemeIcon('layout');
  }
}

class RouteNode extends TreeNode {
  constructor(label: string, route: string, codicon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(codicon);
    this.contextValue = 'zg.route';
    this.command = {
      command: 'zettelgeist.openRoute',
      title: `Open ${label}`,
      arguments: [route],
    };
  }
}

class StatusGroup extends TreeNode {
  constructor(public readonly status: Status, public readonly count: number) {
    super(`${capitalize(status)} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(STATUS_ICON[status]);
    this.contextValue = 'zg.statusGroup';
  }
}

class SpecNode extends TreeNode {
  constructor(public readonly spec: SpecListItem) {
    super(spec.name, vscode.TreeItemCollapsibleState.None);
    this.description = spec.progress;
    this.tooltip = spec.blockedBy ? `${spec.name} — blocked: ${spec.blockedBy}` : spec.name;
    this.iconPath = new vscode.ThemeIcon(STATUS_ICON[spec.status]);
    this.contextValue = 'zg.spec';
    // Click → open the board webview and deep-link to this spec's detail
    // view. The webview's router picks up the initial hash on load (or
    // postMessage navigates if the panel is already open).
    this.command = {
      command: 'zettelgeist.openRoute',
      title: `Open ${spec.name}`,
      arguments: [`/spec/${encodeURIComponent(spec.name)}`],
    };
  }
}

export class SpecTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._emitter.event;

  constructor(private readonly backend: ReturnType<typeof makeBackend>) {}

  refresh(): void {
    this._emitter.fire(undefined);
  }

  getTreeItem(el: TreeNode): vscode.TreeItem {
    return el;
  }

  async getChildren(parent?: TreeNode): Promise<TreeNode[]> {
    if (parent instanceof ViewsRoot) {
      return [
        new RouteNode('Board',  '/',      'layout-panel'),
        new RouteNode('Graph',  '/graph', 'type-hierarchy'),
        new RouteNode('Docs',   '/docs',  'book'),
      ];
    }
    if (parent instanceof StatusGroup) {
      const all = await this.listSpecs();
      return all.filter((s) => s.status === parent.status).map((s) => new SpecNode(s));
    }
    if (!parent) {
      const all = await this.listSpecs();
      const counts: Record<Status, number> = {
        draft: 0, planned: 0, 'in-progress': 0, 'in-review': 0, done: 0, blocked: 0, cancelled: 0,
      };
      for (const s of all) counts[s.status]++;
      // Roots: a Views section at the top, then one group per non-empty status.
      const groups = STATUS_ORDER
        .filter((status) => counts[status] > 0)
        .map((status) => new StatusGroup(status, counts[status]));
      return [new ViewsRoot(), ...groups];
    }
    return [];
  }

  private async listSpecs(): Promise<SpecListItem[]> {
    try {
      const result = await this.backend.dispatch({ id: 0, method: 'listSpecs', args: [] });
      return result as SpecListItem[];
    } catch {
      return [];
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
