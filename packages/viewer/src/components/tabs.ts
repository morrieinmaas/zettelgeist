export interface Tab {
  id: string;
  label: string;
  render: () => HTMLElement;
}

export function renderTabs(tabs: Tab[]): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'zg-tabs';

  const nav = document.createElement('nav');
  nav.className = 'zg-tab-nav';

  const content = document.createElement('div');
  content.className = 'zg-tab-content';

  function activate(id: string): void {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    nav.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === id);
    });
    content.innerHTML = '';
    content.appendChild(tab.render());
  }

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => activate(tab.id));
    nav.appendChild(btn);
  }

  wrapper.appendChild(nav);
  wrapper.appendChild(content);

  if (tabs.length > 0) activate(tabs[0]!.id);

  return wrapper;
}
