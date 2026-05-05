/**
 * Page scanner — orchestrates browser-side DOM analysis and server-side optimization.
 *
 * Combines visibility-clone, layout-analyzer, list-finder, and token-optimizer
 * into a single pipeline that produces clean, token-efficient page representations.
 *
 * Port of agent-browser-mcp's simphtml.py::get_html() + get_main_block().
 */

import { JSDOM } from 'jsdom';
import { logger } from '@utils/logger';
import { VISIBILITY_CLONE_JS } from './visibility-clone';
import { LAYOUT_ANALYZER_JS } from './layout-analyzer';
import { optimizeHtmlForTokens, smartTruncate } from './token-optimizer';
import type { ScanOptions, DomDiffResult } from './types';

/** Combined browser-side script for full page analysis. */
export const FULL_SCAN_JS = `
(function() {
  const { domCopy, getNodeInfo, isVisible } = ${VISIBILITY_CLONE_JS.replace('createEnhancedDOMCopy();', '').replace('function createEnhancedDOMCopy() {', '(function createEnhancedDOMCopy() {').slice(0, -1)};
  ${LAYOUT_ANALYZER_JS.replace('analyzeLayout(domCopy, getNodeInfo, isVisible);', '')}
  return analyzeLayout(domCopy, getNodeInfo, isVisible);
})()
`;

/** Text-only extraction script. */
export const TEXT_ONLY_JS = `
(function() {
  const { domCopy, getNodeInfo, isVisible } = ${VISIBILITY_CLONE_JS.replace('createEnhancedDOMCopy();', '').replace('function createEnhancedDOMCopy() {', '(function createEnhancedDOMCopy() {').slice(0, -1)};
  // Insert block-level newlines
  const blocks = new Set(['DIV','P','H1','H2','H3','H4','H5','H6','LI','TR','SECTION','ARTICLE','HEADER','FOOTER','NAV','BLOCKQUOTE','PRE','HR','BR','DT','DD','FIGCAPTION','DETAILS','SUMMARY']);
  domCopy.querySelectorAll('*').forEach(el => {
    if (blocks.has(el.tagName)) el.insertAdjacentText('beforebegin', '\\n');
  });
  // Describe form fields
  domCopy.querySelectorAll('input:not([type=hidden]),textarea,select').forEach(el => {
    const p = [el.tagName, el.id && '#'+el.id, el.getAttribute('name') && 'name='+el.getAttribute('name()),
      el.tagName==='INPUT' && 'type='+(el.getAttribute('type')||'text'),
      el.getAttribute('placeholder') && '"'+el.getAttribute('placeholder')+'"',
      el.getAttribute('data-autofilled') && 'autofilled',
      el.disabled && 'disabled',
      el.tagName==='SELECT' && el.getAttribute('data-selected') && '="'+el.getAttribute('data-selected')+'"'
    ].filter(Boolean).join(' ');
    el.insertAdjacentText('beforebegin', '\\n['+p+']\\n');
  });
  domCopy.querySelectorAll('button[disabled]').forEach(el => el.insertAdjacentText('beforebegin', '[DISABLED] '));
  return domCopy.textContent;
})()
`;

/** Transient text monitor — start script. */
export const TRANSIENT_MONITOR_START_JS = `
(function() {
  if (window._tm && window._tm.id) clearInterval(window._tm.id);
  window._tm = {extract: () => {
    const texts = new Set(), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, t, s;
    while (node = walker.nextNode())
      if ((t = node.textContent.trim()) && t.length > 10 && !(s = t.substring(0, 20)).includes('_'))
        texts.add(t);
    return texts;
  }};
  window._tm.init = window._tm.extract();
  window._tm.all = new Set();
  window._tm.id = setInterval(() => window._tm.extract().forEach(t => window._tm.all.add(t)), 450);
})()
`;

/** Transient text monitor — stop and collect script. */
export const TRANSIENT_MONITOR_STOP_JS = `
(function() {
  if (!window._tm) return [];
  clearInterval(window._tm.id);
  const final = window._tm.extract();
  const newlySeen = [...window._tm.all].filter(t => !window._tm.init.has(t));
  let result = newlySeen.length < 8 ? newlySeen : newlySeen.filter(t => !final.has(t));
  delete window._tm;
  return result;
})()
`;

/**
 * Process raw HTML from browser-side scan through server-side optimization.
 * If `cutlist` is enabled, finds and truncates list containers.
 */
export function processScanResult(
  rawHtml: string,
  options: Pick<ScanOptions, 'cutlist' | 'maxChars' | 'instruction'> = {},
): string {
  const { cutlist = true, maxChars = 35000 } = options;

  if (!cutlist) {
    const optimized = optimizeHtmlForTokens(rawHtml);
    if (optimized.length > maxChars) return smartTruncate(optimized, maxChars);
    return optimized;
  }

  // Find and truncate lists
  const dom = new JSDOM(rawHtml);
  const doc = dom.window.document;

  const lists = findListsInDoc(doc);
  if (lists.length > 0) {
    logger.info(`[dom-intel] Found ${lists.length} list(s): ${lists.map((l) => l.selector).join(', ')}`);
  }

  for (const entry of lists) {
    const items = doc.querySelectorAll(entry.selector);
    if (items.length < 5) continue;
    const totalLen = Array.from(items).reduce((sum, it) => sum + it.outerHTML.length, 0);
    const avgLen = totalLen / items.length;
    logger.debug(`[dom-intel]   '${entry.selector}': ${items.length} items, avg ${Math.round(avgLen)} chars`);
    if (avgLen < 200 || (avgLen < 700 && totalLen < 2500)) continue;

    const keep = Array.from(items).slice(0, 3);
    const removed = Array.from(items).filter((it) => !keep.includes(it));

    const hint = doc.createElement('div');
    const sampleTexts = removed
      .slice(0, 5)
      .map((el) => el.textContent?.trim().slice(0, 40))
      .filter(Boolean);
    hint.textContent = `[FAKE ELEMENT] ${removed.length} more items hidden, selector: "${entry.selector}"`;
    if (sampleTexts.length) {
      hint.textContent += ` Hidden items: ${sampleTexts.map((t) => `"${t}"`).join(',')}`;
    }
    if (keep.length) keep[keep.length - 1]!.after(hint);
    for (const it of removed) it.remove();
  }

  const optimized = optimizeHtmlForTokens(doc.body.innerHTML);
  logger.info(`[dom-intel] Result: ${rawHtml.length} → ${optimized.length} chars (${rawHtml.length > 0 ? Math.round((1 - optimized.length / rawHtml.length) * 100) : 0}% saved)`);

  if (optimized.length > maxChars) return smartTruncate(optimized, maxChars);
  return optimized;
}

/**
 * Clean text-only output: collapse whitespace, trim.
 */
export function cleanTextOutput(text: string): string {
  let result = text;
  result = result.replace(/ {2,}/g, ' ');
  result = result.replace(/^ +/gm, '');
  result = result.replace(/(\n\s*){3,}/g, '\n\n');
  return result.trim();
}

/**
 * Compare two HTML snapshots and find changes.
 */
export function diffPages(beforeHtml: string, afterHtml: string): DomDiffResult {
  const beforeDoc = new JSDOM(beforeHtml).window.document;
  const afterDoc = new JSDOM(afterHtml).window.document;

  function directText(el: Element): string {
    return Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent?.trim())
      .filter(Boolean)
      .join('');
  }

  function getSig(el: Element): string {
    const attrs: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name !== 'data-track-id') attrs[attr.name] = attr.value;
    }
    return `${el.tagName}:${JSON.stringify(attrs)}:${directText(el)}`;
  }

  function buildSigs(doc: Document): Map<string, Element[]> {
    const result = new Map<string, Element[]>();
    for (const el of doc.querySelectorAll('*')) {
      const sig = getSig(el);
      if (!result.has(sig)) result.set(sig, []);
      result.get(sig)!.push(el);
    }
    return result;
  }

  const beforeSigs = buildSigs(beforeDoc);
  const afterSigs = buildSigs(afterDoc);
  const changed: Element[] = [];

  for (const [sig, els] of afterSigs) {
    const beforeEls = beforeSigs.get(sig);
    if (!beforeEls) {
      changed.push(...els);
    } else if (els.length > beforeEls.length) {
      changed.push(...els.slice(0, els.length - beforeEls.length));
    }
  }

  if (changed.length === 0 && beforeHtml !== afterHtml) {
    const beforeAll = beforeDoc.querySelectorAll('*');
    const afterAll = afterDoc.querySelectorAll('*');
    const len = Math.min(beforeAll.length, afterAll.length);
    for (let i = 0; i < len; i++) {
      if (getSig(beforeAll[i]!) !== getSig(afterAll[i]!)) {
        changed.push(afterAll[i]!);
      }
    }
  }

  const cids = new Set(changed.map((el) => el));
  const boundaries = changed.filter((el) => !el.parentElement || !cids.has(el.parentElement));
  const top = boundaries.sort((a, b) => b.outerHTML.length - a.outerHTML.length)[0];

  const result: DomDiffResult = { changed: changed.length };
  if (top) {
    const h = top.outerHTML;
    result.topChange = h.length <= 2000 ? h : h.slice(0, 2000) + '...[TRUNCATED]';
  }
  return result;
}

/** Helper: find list selectors in a document. */
function findListsInDoc(doc: Document): Array<{ selector: string; count: number }> {
  const results: Array<{ selector: string; count: number }> = [];
  const seen = new Set<string>();

  for (const el of doc.querySelectorAll('*')) {
    if (el.children.length < 5) continue;
    if (el.closest('svg')) continue;

    const groups = new Map<string, Element[]>();
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      const cls = child.className ? String(child.className).trim().split(/\s+/)[0] : '';
      const key = cls ? `${tag}.${cls}` : tag;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(child);
    }

    for (const [selector, items] of groups) {
      if (items.length >= 5 && !seen.has(selector)) {
        seen.add(selector);
        results.push({ selector, count: items.length });
      }
    }
  }

  return results.sort((a, b) => b.count - a.count).slice(0, 5);
}
