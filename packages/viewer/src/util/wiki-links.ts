// Wiki-style links: `[[spec-name]]` inside any markdown body becomes a
// router link to that spec's detail page. Inspired by Obsidian / Roam /
// Rowboat — and the zettelkasten model the project name invokes.
//
// We process AFTER marked + DOMPurify rather than before, for two reasons:
//   1. Marked-level transforms would have to know about wiki-link syntax;
//      this keeps the markdown layer pure.
//   2. The "does this target exist?" decision needs the spec list, which
//      arrives async — easier to apply over a rendered DOM than to await
//      it inside marked's render pipeline.

const WIKILINK_RE = /\[\[([^\]\n]+)\]\]/g;
const EXCLUDED_TAGS = new Set(['CODE', 'PRE', 'A']);

function collectCandidates(node: Node, out: Text[]): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      // Text node
      const text = child.textContent ?? '';
      if (text.includes('[[')) out.push(child as Text);
    } else if (child.nodeType === 1) {
      const tag = (child as Element).tagName;
      if (EXCLUDED_TAGS.has(tag)) continue;
      collectCandidates(child, out);
    }
  }
}

export type WikiLinkResolver = (name: string) => string | null;

/**
 * Build a resolver that maps a wiki-link `[[name]]` to a viewer route.
 * Looks up specs first (`#/spec/<name>`), then docs by filename basename
 * (`#/docs/<full-path>`). Returns null when nothing matches — caller styles
 * the anchor as a missing-target.
 */
export function makeWikiLinkResolver(
  specNames: Iterable<string>,
  docPaths: Iterable<string>,
): WikiLinkResolver {
  const specs = new Set(specNames);
  // Map basename-without-.md → full path. Lets `[[onboarding]]` find
  // `docs/onboarding.md` without making users type the full path.
  const docs = new Map<string, string>();
  for (const p of docPaths) {
    const basename = p.replace(/^.*\//, '').replace(/\.md$/, '');
    docs.set(basename, p);
  }
  return (name: string): string | null => {
    if (specs.has(name)) return `#/spec/${encodeURIComponent(name)}`;
    const docPath = docs.get(name);
    if (docPath) return `#/docs/${encodeURIComponent(docPath)}`;
    return null;
  };
}

/**
 * Walk a DOM subtree and replace every `[[name]]` text run with an anchor.
 * The resolver decides the target route — usually to a spec detail page
 * or a doc. When the resolver returns null, the anchor still renders but
 * gets a `zg-wikilink-missing` class so it can be styled differently
 * (e.g., orange + tooltip "doesn't exist yet").
 *
 * Idempotent: a second pass finds no `[[…]]` text to replace (we transform
 * text nodes, not anchor contents).
 */
export function processWikiLinks(root: HTMLElement, resolver: WikiLinkResolver): void {
  // Plain recursive walk — TreeWalker's filter-callback semantics differ
  // subtly across happy-dom and real browsers, so we just collect
  // candidates ourselves. Skip text inside <code>/<pre>/<a>; only keep
  // text nodes that actually contain `[[`.
  const targets: Text[] = [];
  collectCandidates(root, targets);

  for (const textNode of targets) {
    const frag = document.createDocumentFragment();
    const text = textNode.textContent ?? '';
    let lastIdx = 0;
    // Reset the regex per text node — re-using the same lastIndex across
    // iterations because the regex is /g would skip matches.
    const re = new RegExp(WIKILINK_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      }
      const name = m[1]!.trim();
      const route = resolver(name);
      const a = document.createElement('a');
      // Even for missing targets we still emit a usable anchor — clicking it
      // navigates to the spec route, which is where the user would create the
      // spec from. (Docs are folder-anchored so we can't make up a path.)
      a.href = route ?? `#/spec/${encodeURIComponent(name)}`;
      a.textContent = name;
      a.className = 'zg-wikilink' + (route ? '' : ' zg-wikilink-missing');
      if (!route) a.title = `"${name}" doesn't exist yet`;
      frag.appendChild(a);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    textNode.replaceWith(frag);
  }
}
