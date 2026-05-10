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
      .replace(/:([a-zA-Z]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
    this.routes.push({ pattern: new RegExp('^' + regexStr + '$'), paramNames, handler });
  }

  setNotFound(handler: RouteHandler): void {
    this.notFoundHandler = handler;
  }

  async navigate(): Promise<void> {
    const hash = window.location.hash.slice(1) || '/';
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
    window.addEventListener('hashchange', () => { this.navigate(); });
    window.addEventListener('DOMContentLoaded', () => { this.navigate(); });
    if (document.readyState !== 'loading') {
      this.navigate();
    }
  }
}
