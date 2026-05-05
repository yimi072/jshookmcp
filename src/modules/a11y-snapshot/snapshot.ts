/**
 * Accessibility snapshot — builds a DOM tree with @ref numbers for AI interaction.
 *
 * Runs in browser context via executeJs. Returns:
 *   { tree: string, refs: Record<number, string>, stats: { elements, interactive, visible } }
 *
 * Inspired by bb-browser's buildDomTree.js but simplified for MCP use.
 */

/**
 * The browser-side JS that builds the accessibility snapshot.
 * Injected via executeJs — must be self-contained.
 */
export const SNAPSHOT_JS = `(() => {
  const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','LINK','META','HEAD','BR','HR']);
  const INTERACTIVE_TAGS = new Set(['A','BUTTON','INPUT','SELECT','TEXTAREA','DETAILS','SUMMARY']);
  const INLINE_TAGS = new Set(['SPAN','A','B','I','U','EM','STRONG','SMALL','CODE','MARK','ABBR','TIME','LABEL','SVG']);

  let refId = 0;
  const refs = {};
  let elemCount = 0, interCount = 0, visCount = 0;

  function isVisible(el) {
    if (!el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function isInteractive(el) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('onmousedown')) return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') return true;
    if (el.tabIndex >= 0 && el.tagName !== 'DIV' && el.tagName !== 'SPAN') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function getXPath(el) {
    if (el.id) return '//*[@id="' + el.id + '"]';
    const parts = [];
    while (el && el.nodeType === 1) {
      let idx = 0, sibling = el.previousSibling;
      while (sibling) { if (sibling.nodeType === 1 && sibling.tagName === el.tagName) idx++; sibling = sibling.previousSibling; }
      const tag = el.tagName.toLowerCase();
      parts.unshift(tag + '[' + (idx + 1) + ']');
      el = el.parentNode;
    }
    return '/' + parts.join('/');
  }

  function getText(el) {
    if (el.tagName === 'INPUT') return el.value || el.placeholder || '';
    if (el.tagName === 'SELECT') { const o = el.options[el.selectedIndex]; return o ? o.text : ''; }
    if (el.tagName === 'TEXTAREA') return el.value || '';
    const direct = [];
    for (const child of el.childNodes) {
      if (child.nodeType === 3) { const t = child.textContent.trim(); if (t) direct.push(t); }
    }
    return direct.join(' ').slice(0, 200);
  }

  function getAttrs(el) {
    const attrs = {};
    if (el.id) attrs.id = el.id;
    if (el.className && typeof el.className === 'string') attrs.class = el.className.split(' ').filter(Boolean).slice(0, 3).join('.');
    if (el.href) attrs.href = el.href.slice(0, 100);
    if (el.type) attrs.type = el.type;
    if (el.placeholder) attrs.placeholder = el.placeholder.slice(0, 50);
    if (el.getAttribute('aria-label')) attrs.ariaLabel = el.getAttribute('aria-label').slice(0, 80);
    if (el.title) attrs.title = el.title.slice(0, 80);
    return attrs;
  }

  function buildTree(el, depth, maxDepth) {
    if (depth > maxDepth) return '';
    if (!el || !el.tagName) return '';
    if (SKIP_TAGS.has(el.tagName)) return '';

    elemCount++;
    const visible = isVisible(el);
    if (visible) visCount++;
    const interactive = isInteractive(el);
    if (interactive) interCount++;

    let ref = -1;
    if (interactive && visible) {
      ref = refId++;
      refs[ref] = getXPath(el);
    }

    const indent = '  '.repeat(depth);
    const tag = el.tagName.toLowerCase();
    const text = getText(el);
    const attrs = getAttrs(el);

    let line = indent;
    if (ref >= 0) line += '[#' + ref + '] ';
    line += '<' + tag;
    if (attrs.id) line += ' id=' + attrs.id;
    if (attrs.class) line += '.' + attrs.class;
    if (attrs.type) line += ' type=' + attrs.type;
    if (attrs.href) line += ' href=' + attrs.href.slice(0, 60);
    if (attrs.placeholder) line += ' placeholder="' + attrs.placeholder + '"';
    if (attrs.ariaLabel) line += ' aria="' + attrs.ariaLabel + '"';
    line += '>';
    if (text) line += ' ' + text.slice(0, 150);

    const children = [];
    for (const child of el.children) {
      const childStr = buildTree(child, depth + 1, maxDepth);
      if (childStr) children.push(childStr);
    }

    // Also check shadow DOM
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) {
        const childStr = buildTree(child, depth + 1, maxDepth);
        if (childStr) children.push(childStr);
      }
    }

    if (children.length === 0 && !text) return '';

    let result = line;
    if (children.length > 0) result += '\\n' + children.join('\\n');
    return result;
  }

  try {
    const tree = buildTree(document.body, 0, 15);
    return {
      tree: tree,
      refs: refs,
      stats: { elements: elemCount, interactive: interCount, visible: visCount }
    };
  } catch (e) {
    return { error: e.message, tree: '', refs: {}, stats: { elements: 0, interactive: 0, visible: 0 } };
  }
})()`;

export interface SnapshotResult {
  tree: string;
  refs: Record<number, string>;
  stats: { elements: number; interactive: number; visible: number };
}

/**
 * Parse the raw snapshot result from executeJs.
 */
export function parseSnapshot(raw: unknown): SnapshotResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.error) return null;
  return {
    tree: String(obj.tree ?? ''),
    refs: (obj.refs ?? {}) as Record<number, string>,
    stats: (obj.stats ?? { elements: 0, interactive: 0, visible: 0 }) as SnapshotResult['stats'],
  };
}
