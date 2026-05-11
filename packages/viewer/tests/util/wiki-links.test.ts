import { describe, expect, it, beforeEach } from 'vitest';
import { processWikiLinks } from '../../src/util/wiki-links.js';

describe('processWikiLinks', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  it('turns [[name]] into an anchor pointing at the spec route', () => {
    root.innerHTML = '<p>See also [[user-auth]] for context.</p>';
    processWikiLinks(root, new Set(['user-auth']));
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('#/spec/user-auth');
    expect(a.textContent).toBe('user-auth');
    expect(a.classList.contains('zg-wikilink-missing')).toBe(false);
  });

  it('marks unknown specs as missing-target', () => {
    root.innerHTML = '<p>Future work in [[ghost-spec]] tracked elsewhere.</p>';
    processWikiLinks(root, new Set(['user-auth']));
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a.classList.contains('zg-wikilink-missing')).toBe(true);
    expect(a.getAttribute('title')).toContain("doesn't exist");
  });

  it('handles multiple wiki-links in a single text node', () => {
    root.innerHTML = '<p>[[a]] depends on [[b]] and [[c]].</p>';
    processWikiLinks(root, new Set(['a', 'b']));
    const anchors = root.querySelectorAll('a.zg-wikilink');
    expect(anchors.length).toBe(3);
    expect(anchors[0]!.textContent).toBe('a');
    expect(anchors[1]!.textContent).toBe('b');
    expect(anchors[2]!.classList.contains('zg-wikilink-missing')).toBe(true);
  });

  it('preserves surrounding text', () => {
    root.innerHTML = '<p>before [[x]] after</p>';
    processWikiLinks(root, new Set(['x']));
    expect(root.textContent).toBe('before x after');
  });

  it('skips inside <code> and <pre> so the syntax stays literal in code samples', () => {
    root.innerHTML = '<p><code>[[literal]]</code> but [[real]] gets a link.</p>';
    processWikiLinks(root, new Set(['real']));
    expect(root.querySelectorAll('a.zg-wikilink').length).toBe(1);
    expect(root.querySelector('code')?.textContent).toBe('[[literal]]');
  });

  it('is idempotent (second call does nothing)', () => {
    root.innerHTML = '<p>Link to [[a]].</p>';
    processWikiLinks(root, new Set(['a']));
    processWikiLinks(root, new Set(['a']));
    expect(root.querySelectorAll('a.zg-wikilink').length).toBe(1);
  });
});
