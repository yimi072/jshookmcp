/**
 * Server-side HTML token optimization using jsdom.
 *
 * Port of agent-browser-mcp's simphtml.py::optimize_html_for_tokens() + smart_truncate().
 * Strips unnecessary attributes, truncates long values, and smart-truncates to a budget.
 */

import { JSDOM } from 'jsdom';
import type { OptimizeStats } from './types';

const KEEP_ATTRS = new Set([
  'id', 'class', 'name', 'src', 'href', 'alt', 'value', 'type', 'placeholder',
  'disabled', 'checked', 'selected', 'readonly', 'required', 'multiple',
  'role', 'aria-label', 'aria-expanded', 'aria-hidden', 'contenteditable',
  'title', 'for', 'action', 'method', 'target', 'colspan', 'rowspan',
]);

/**
 * Optimize HTML for token efficiency: strip styles, truncate long attributes, compress data-*.
 */
export function optimizeHtmlForTokens(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Clear SVGs
  for (const svg of doc.querySelectorAll('svg')) {
    svg.innerHTML = '';
    for (const attr of Array.from(svg.attributes)) svg.removeAttribute(attr.name);
  }

  // Strip style attributes
  for (const el of doc.querySelectorAll('*')) {
    el.removeAttribute('style');
  }

  // Process attributes
  for (const el of doc.querySelectorAll('*')) {
    // Truncate src
    const src = el.getAttribute('src');
    if (src) {
      if (src.startsWith('data:')) el.setAttribute('src', '__img__');
      else if (src.length > 30) el.setAttribute('src', '__url__');
    }

    // Truncate href
    const href = el.getAttribute('href');
    if (href && href.length > 30) el.setAttribute('href', '__link__');

    // Truncate action
    const action = el.getAttribute('action');
    if (action && action.length > 30) el.setAttribute('action', '__url__');

    // Truncate long text attributes
    for (const attr of ['value', 'title', 'alt']) {
      const val = el.getAttribute(attr);
      if (val && val.length > 100) el.setAttribute(attr, val.slice(0, 50) + ' ...');
    }

    // Process remaining attributes
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      if (KEEP_ATTRS.has(name)) continue;

      if (name.startsWith('data-v')) {
        el.removeAttribute(name);
      } else if (name.startsWith('data-') && attr.value.length > 20) {
        el.setAttribute(name, '__data__');
      } else if (!name.startsWith('data-')) {
        el.removeAttribute(name);
      }
    }
  }

  return doc.body.innerHTML;
}

/**
 * Smart truncation: recursively cut the DOM tree to fit within a character budget.
 * Strategy: find the branch point by penetrating single-child elements;
 * top-3 children share the overage proportionally, otherwise tail-cut.
 */
export function smartTruncate(html: string, budget: number): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const CUT_THRESHOLD = 8000;

  function cutText(element: Element, keep: number): void {
    const fullLen = element.innerHTML.length;
    const over = fullLen - keep;
    if (over <= 0) return;

    // Protect FAKE ELEMENT hints
    const protectedEls: Element[] = [];
    for (const child of Array.from(element.children)) {
      if (child.textContent?.includes('[FAKE ELEMENT]')) {
        protectedEls.push(child);
        child.remove();
      }
    }

    const inner = element.innerHTML;
    const marker = ` [TRUNCATED ${Math.floor(over / 1000)}k chars]`;
    const tagOverhead = element.outerHTML.length - inner.length;
    const innerKeep = Math.max(keep - tagOverhead - marker.length, 0);

    element.innerHTML = inner.slice(0, innerKeep) + marker;

    for (const p of protectedEls) element.appendChild(p);
  }

  function truncate(element: Element, budget: number, depth: number): void {
    const total = element.innerHTML.length;
    if (total <= budget) return;

    const children = Array.from(element.children).filter(
      (c) => !c.textContent?.includes('[FAKE ELEMENT]'),
    );
    if (children.length === 0) return;

    const selfLen = total - children.reduce((sum, c) => sum + c.outerHTML.length, 0);
    const remainingBudget = Math.max(budget - selfLen, 0);

    // Single child: penetrate
    if (children.length === 1) {
      truncate(children[0]!, remainingBudget, depth + 1);
      return;
    }

    const kidsWithSize = children.map((c) => ({ el: c, size: c.outerHTML.length }));
    const over = kidsWithSize.reduce((sum, k) => sum + k.size, 0) - remainingBudget;
    if (over <= 0) return;

    // Check if top-3 can absorb the overage
    const ranked = [...kidsWithSize].sort((a, b) => b.size - a.size);
    const top3 = ranked.slice(0, Math.min(3, ranked.length));
    const top3Total = top3.reduce((sum, k) => sum + k.size, 0);

    if (top3Total < over) {
      // Top-3 can't absorb: tail-cut from end
      let removed = 0;
      let removedCount = 0;
      const reversed = [...kidsWithSize].reverse();
      for (const k of reversed) {
        if (removed >= over) break;
        k.el.remove();
        removed += k.size;
        removedCount++;
      }
      return;
    }

    // Top-2~3 absorb proportionally
    const maxSize = ranked[0]!.size;
    const filtered = top3.filter((k) => k.size >= maxSize * 0.1);
    const filteredTotal = filtered.reduce((sum, k) => sum + k.size, 0);

    const absorbers = filteredTotal >= over ? filtered : top3;
    const absorberTotal = absorbers.reduce((sum, k) => sum + k.size, 0);

    for (const k of absorbers) {
      const share = Math.floor((over * k.size) / absorberTotal);
      const newKeep = k.size - share;
      if (newKeep <= 0) {
        k.el.remove();
      } else if (newKeep > CUT_THRESHOLD) {
        truncate(k.el, newKeep, depth + 1);
      } else {
        cutText(k.el, newKeep);
      }
    }
  }

  // Process list truncation: find lists and keep only first 3 items + hint
  const lists = findMainLists(doc);
  for (const entry of lists) {
    const items = doc.querySelectorAll(entry.selector);
    if (items.length < 5) continue;
    const totalLen = Array.from(items).reduce((sum, it) => sum + it.outerHTML.length, 0);
    const avgLen = totalLen / items.length;
    if (avgLen < 200 || (avgLen < 700 && totalLen < 2500)) continue;

    const keep = Array.from(items).slice(0, 3);
    const removed = Array.from(items).filter((it) => !keep.includes(it));

    // Add hint
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

  const body = doc.body;
  const currentLen = body.innerHTML.length;
  if (currentLen > budget) {
    truncate(body, budget, 0);
  }

  return body.innerHTML;
}

/**
 * Find main lists in a document (simplified server-side version).
 */
function findMainLists(doc: Document): Array<{ selector: string; count: number }> {
  const results: Array<{ selector: string; count: number }> = [];

  // Look for common list patterns
  for (const el of doc.querySelectorAll('*')) {
    if (el.children.length < 5) continue;
    if (el.closest('svg')) continue;

    // Count children by tag+class
    const groups = new Map<string, Element[]>();
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      const cls = child.className ? String(child.className).trim().split(/\s+/)[0] : '';
      const key = cls ? `${tag}.${cls}` : tag;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(child);
    }

    for (const [selector, items] of groups) {
      if (items.length >= 5) {
        results.push({ selector, count: items.length });
      }
    }
  }

  // Dedup and sort by count
  const seen = new Set<string>();
  return results
    .filter((r) => {
      if (seen.has(r.selector)) return false;
      seen.add(r.selector);
      return true;
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * Optimize and truncate HTML to fit within maxChars.
 */
export function optimizeAndTruncate(html: string, maxChars: number): { html: string; stats: OptimizeStats } {
  const originalLength = html.length;
  const optimized = optimizeHtmlForTokens(html);
  const truncated = optimized.length > maxChars ? smartTruncate(optimized, maxChars) : optimized;
  return {
    html: truncated,
    stats: {
      originalLength,
      optimizedLength: truncated.length,
      savedPercent: originalLength > 0 ? Math.round((1 - truncated.length / originalLength) * 100) : 0,
    },
  };
}
