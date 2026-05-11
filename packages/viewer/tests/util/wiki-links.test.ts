import { describe, expect, it, beforeEach } from 'vitest';
import { processWikiLinks, makeWikiLinkResolver } from '../../src/util/wiki-links.js';

describe('processWikiLinks', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
  });

  function specResolver(specs: string[]): (n: string) => string | null {
    return makeWikiLinkResolver(specs, []);
  }

  it('turns [[name]] into an anchor pointing at the spec route', () => {
    root.innerHTML = '<p>See also [[user-auth]] for context.</p>';
    processWikiLinks(root, specResolver(['user-auth']));
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('#/spec/user-auth');
    expect(a.textContent).toBe('user-auth');
    expect(a.classList.contains('zg-wikilink-missing')).toBe(false);
  });

  it('marks unknown specs as missing-target', () => {
    root.innerHTML = '<p>Future work in [[ghost-spec]] tracked elsewhere.</p>';
    processWikiLinks(root, specResolver(['user-auth']));
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a.classList.contains('zg-wikilink-missing')).toBe(true);
    expect(a.getAttribute('title')).toContain("doesn't exist");
  });

  it('handles multiple wiki-links in a single text node', () => {
    root.innerHTML = '<p>[[a]] depends on [[b]] and [[c]].</p>';
    processWikiLinks(root, specResolver(['a', 'b']));
    const anchors = root.querySelectorAll('a.zg-wikilink');
    expect(anchors.length).toBe(3);
    expect(anchors[0]!.textContent).toBe('a');
    expect(anchors[1]!.textContent).toBe('b');
    expect(anchors[2]!.classList.contains('zg-wikilink-missing')).toBe(true);
  });

  it('preserves surrounding text', () => {
    root.innerHTML = '<p>before [[x]] after</p>';
    processWikiLinks(root, specResolver(['x']));
    expect(root.textContent).toBe('before x after');
  });

  it('skips inside <code> and <pre> so the syntax stays literal in code samples', () => {
    root.innerHTML = '<p><code>[[literal]]</code> but [[real]] gets a link.</p>';
    processWikiLinks(root, specResolver(['real']));
    expect(root.querySelectorAll('a.zg-wikilink').length).toBe(1);
    expect(root.querySelector('code')?.textContent).toBe('[[literal]]');
  });

  it('is idempotent (second call does nothing)', () => {
    root.innerHTML = '<p>Link to [[a]].</p>';
    processWikiLinks(root, specResolver(['a']));
    processWikiLinks(root, specResolver(['a']));
    expect(root.querySelectorAll('a.zg-wikilink').length).toBe(1);
  });

  it('resolves to a doc when the name matches a doc basename', () => {
    root.innerHTML = '<p>See [[onboarding]] for details.</p>';
    const resolver = makeWikiLinkResolver([], ['docs/onboarding.md', 'docs/architecture.md']);
    processWikiLinks(root, resolver);
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a).not.toBeNull();
    expect(decodeURIComponent(a.getAttribute('href')!)).toBe('#/docs/docs/onboarding.md');
    expect(a.classList.contains('zg-wikilink-missing')).toBe(false);
  });

  it('prefers a spec over a doc when both share a name', () => {
    root.innerHTML = '<p>Implements [[user-auth]].</p>';
    const resolver = makeWikiLinkResolver(['user-auth'], ['docs/user-auth.md']);
    processWikiLinks(root, resolver);
    const a = root.querySelector('a.zg-wikilink') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('#/spec/user-auth');
  });
});
