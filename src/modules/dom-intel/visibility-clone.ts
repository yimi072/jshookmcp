/**
 * Browser-side DOM cloning with visibility analysis.
 *
 * This code runs inside the page context (injected via page_evaluate).
 * It recursively clones the DOM, skipping invisible elements, tracking
 * per-node metadata (rect, area, zIndex, visibility), and handling
 * iframe/shadow DOM traversal.
 *
 * Port of agent-browser-mcp's simphtml.py::createEnhancedDOMCopy().
 */

export const VISIBILITY_CLONE_JS = /* js */ `
function createEnhancedDOMCopy() {
  const nodeInfo = new WeakMap();
  const ignoreTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'COLGROUP', 'COL', 'TEMPLATE', 'PARAM', 'SOURCE'];
  const ignoreIds = ['ljq-ind'];

  function cloneNode(sourceNode, keep) {
    if (sourceNode.nodeType === 8 ||
        (sourceNode.nodeType === 1 && (
          ignoreTags.includes(sourceNode.tagName) ||
          (sourceNode.id && ignoreIds.includes(sourceNode.id))
        ))) {
      return null;
    }
    if (sourceNode.nodeType === 3) return sourceNode.cloneNode(false);
    const clone = sourceNode.cloneNode(false);

    // Preserve input values
    if ((sourceNode.tagName === 'INPUT' || sourceNode.tagName === 'TEXTAREA') && sourceNode.value)
      clone.setAttribute('value', sourceNode.value);
    if (sourceNode.tagName === 'INPUT' && (sourceNode.type === 'radio' || sourceNode.type === 'checkbox') && sourceNode.checked)
      clone.setAttribute('checked', '');
    else if (sourceNode.tagName === 'SELECT' && sourceNode.value)
      clone.setAttribute('data-selected', sourceNode.value);

    // Autofill detection
    try {
      if (sourceNode.matches && sourceNode.matches(':-webkit-autofill')) {
        clone.setAttribute('data-autofilled', 'true');
        if (!sourceNode.value) clone.setAttribute('value', '[autofilled-protected]');
      }
    } catch(e) {}

    // Dropdown detection
    const isDropdown = sourceNode.classList?.contains('dropdown-menu') ||
             /dropdown|menu/i.test(sourceNode.className) || sourceNode.getAttribute('role') === 'menu';
    const _ddItems = isDropdown ? sourceNode.querySelectorAll('a, button, [role="menuitem"], li').length : 0;
    const isSmallDropdown = _ddItems > 0 && _ddItems <= 7 && sourceNode.textContent.length < 500;

    // Recurse children
    const childNodes = [];
    for (const child of sourceNode.childNodes) {
      const childClone = cloneNode(child, keep || isSmallDropdown);
      if (childClone) childNodes.push(childClone);
    }

    // iframe content extraction
    if (sourceNode.tagName === 'IFRAME') {
      try {
        const iDoc = sourceNode.contentDocument || sourceNode.contentWindow?.document;
        if (iDoc && iDoc.body && iDoc.body.children.length > 0) {
          const wrapper = document.createElement('div');
          wrapper.setAttribute('data-iframe-content', sourceNode.src || '');
          for (const ch of iDoc.body.childNodes) {
            const c = cloneNode(ch, keep);
            if (c) wrapper.appendChild(c);
          }
          if (wrapper.childNodes.length) childNodes.push(wrapper);
        }
      } catch(e) {}
    }

    // Shadow DOM traversal
    if (sourceNode.shadowRoot) {
      for (const shadowChild of sourceNode.shadowRoot.childNodes) {
        const shadowClone = cloneNode(shadowChild, keep);
        if (shadowClone) childNodes.push(shadowClone);
      }
    }

    // Compute visibility metadata
    const rect = sourceNode.getBoundingClientRect();
    const style = window.getComputedStyle(sourceNode);
    const area = (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0)
      ? 0 : rect.width * rect.height;
    const isVisible = (rect.width > 1 && rect.height > 1 &&
                  style.display !== 'none' && style.visibility !== 'hidden' &&
                  parseFloat(style.opacity) > 0 &&
                  Math.abs(rect.left) < 5000 && Math.abs(rect.top) < 5000)
                  || isSmallDropdown;
    const zIndex = style.position !== 'static' ? (parseInt(style.zIndex) || 0) : 0;

    let info = {
      rect, area, isVisible, isSmallDropdown, zIndex,
      style: {
        display: style.display, visibility: style.visibility,
        opacity: style.opacity, position: style.position
      }
    };

    const nonTextChildren = childNodes.filter(child => child.nodeType !== 3);
    const hasValidChildren = nonTextChildren.length > 0;

    if (hasValidChildren) {
      const childrenInfos = nonTextChildren.map(c => nodeInfo.get(c)).filter(i => i && i.rect && i.rect.width > 0 && i.rect.height > 0);
      const bgAlpha = (() => {
        const c = style.backgroundColor;
        if (!c || c === 'transparent') return 0;
        const m = c.match(/rgba?\\([^)]+,\\s*([\\d.]+)\\)/);
        return m ? parseFloat(m[1]) : 1;
      })();
      const hasVisualBg = bgAlpha > 0.1 || style.backgroundImage !== 'none' || (style.backdropFilter && style.backdropFilter !== 'none') || style.boxShadow !== 'none';

      if (!hasVisualBg && childrenInfos.length > 0) {
        let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
        for (const cInfo of childrenInfos) {
          minL = Math.min(minL, cInfo.rect.left);
          minT = Math.min(minT, cInfo.rect.top);
          maxR = Math.max(maxR, cInfo.rect.right);
          maxB = Math.max(maxB, cInfo.rect.bottom);
        }
        info.rect = { left: minL, top: minT, right: maxR, bottom: maxB, width: maxR - minL, height: maxB - minT };
        info.area = info.rect.width * info.rect.height;
      } else {
        const maxC = childrenInfos.filter(i => i.isVisible).sort((a, b) => b.area - a.area)[0];
        if (maxC && maxC.area > 10000 && (!isVisible || maxC.area > info.area * 5)) info = maxC;
      }
    }

    nodeInfo.set(clone, info);

    // Skip empty DIVs
    if (sourceNode.nodeType === 1 && sourceNode.tagName === 'DIV') {
      if (!hasValidChildren && !sourceNode.textContent.trim()) return null;
    }

    // aria-hidden + not visible = truly hidden
    if (sourceNode.getAttribute && sourceNode.getAttribute('aria-hidden') === 'true' && !info.isVisible) {
      return null;
    }

    if (info.isVisible || hasValidChildren || keep) {
      childNodes.forEach(child => clone.appendChild(child));
      return clone;
    }
    return null;
  }

  return {
    domCopy: cloneNode(document.body),
    getNodeInfo: node => nodeInfo.get(node),
    isVisible: node => {
      const info = nodeInfo.get(node);
      return info && info.isVisible;
    }
  };
}
createEnhancedDOMCopy();
`;
