export type RouteHandler = (params: Record<string, string>) => Promise<void>;

export interface Route {
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private notFoundHandler: RouteHandler = async () => {
    document.getElementById('app')!.innerHTML = '<p>Not found.</p>';
  };

  add(pattern: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const regexStr = pattern
      .replace(/\//g, '\\/')
      .replace(/:([a-zA-Z]+)|\*([a-zA-Z]+)/g, (_, name1, name2) => {
        const name = (name1 ?? name2) as string;
        paramNames.push(name);
        return name1 ? '([^/]+)' : '(.+)';
      });
    this.routes.push({ pattern: new RegExp('^' + regexStr + '$'), paramNames, handler });
  }

  setNotFound(handler: RouteHandler): void {
    this.notFoundHandler = handler;
  }

  async navigate(): Promise<void> {
    const hash = window.location.hash.slice(1) || '/';
    // Track the last non-detail route so the detail view can offer a smart
    // "Back" link. Stored on sessionStorage so it survives micro-reloads but
    // not a fresh tab. Detail routes (`/spec/...`) intentionally don't update
    // it — that's the *destination* we want to come back from.
    if (!hash.startsWith('/spec/')) {
      try { sessionStorage.setItem('zg:prev-route', `#${hash}`); } catch { /* ignore */ }
    }

    for (const route of this.routes) {
      const match = hash.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1] ?? '');
        });
        await route.handler(params);
        return;
      }
    }
    await this.notFoundHandler({});
  }

  start(): void {
    window.addEventListener('hashchange', () => { void this.navigate(); });
    // Trigger the initial render exactly once. The previous version
    // registered DOMContentLoaded AND fired navigate() inline when the
    // document was already loaded → two renders, hence the duplicated
    // wrapper on the graph view.
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => { void this.navigate(); }, { once: true });
    } else {
      void this.navigate();
    }
  }
}
