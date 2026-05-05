/**
 * Element interaction via XPath — used with ref registry.
 * These functions return JS code strings to inject via executeJs.
 */

/**
 * Generate JS to click an element by XPath.
 */
export function clickRefJs(xpath: string): string {
  return `(() => {
    const el = document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) return { error: 'Element not found' };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    el.click();
    return { ok: true, tag: el.tagName, text: (el.textContent || '').slice(0, 50) };
  })()`;
}

/**
 * Generate JS to fill an input by XPath.
 */
export function fillRefJs(xpath: string, text: string): string {
  return `(() => {
    const el = document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) return { error: 'Element not found' };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    el.focus();
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSet) nativeSet.call(el, ${JSON.stringify(text)});
      else el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      return { error: 'Element is not fillable: ' + el.tagName };
    }
    return { ok: true, tag: el.tagName, value: (el.value || el.textContent || '').slice(0, 50) };
  })()`;
}

/**
 * Generate JS to hover an element by XPath.
 */
export function hoverRefJs(xpath: string): string {
  return `(() => {
    const el = document.evaluate(${JSON.stringify(xpath)}, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) return { error: 'Element not found' };
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.left + rect.width/2, clientY: rect.top + rect.height/2 }));
    return { ok: true, tag: el.tagName, text: (el.textContent || '').slice(0, 50) };
  })()`;
}
