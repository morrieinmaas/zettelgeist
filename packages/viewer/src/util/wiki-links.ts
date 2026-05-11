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

/**
 * Walk a DOM subtree and replace every `[[name]]` text run with an anchor
 * that routes to `#/spec/<name>`. If `name` is not in `knownSpecs`, the
 * anchor gets a `zg-wikilink-missing` class so it can be styled differently
 * (e.g., orange + tooltip "spec doesn't exist yet").
 *
 * Idempotent: if called twice, the second pass finds no `[[…]]` text to
 * replace (we transform text nodes, not anchor contents).
 */
export function processWikiLinks(root: HTMLElement, knownSpecs: ReadonlySet<string>): void {
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
      const a = document.createElement('a');
      a.href = `#/spec/${encodeURIComponent(name)}`;
      a.textContent = name;
      a.className = 'zg-wikilink' + (knownSpecs.has(name) ? '' : ' zg-wikilink-missing');
      if (!knownSpecs.has(name)) a.title = `Spec "${name}" doesn't exist yet`;
      frag.appendChild(a);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    textNode.replaceWith(frag);
  }
}
