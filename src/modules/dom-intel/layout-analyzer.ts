/**
 * Browser-side layout analysis: overlay vs partition detection.
 *
 * Port of agent-browser-mcp's simphtml.py::analyzeNode() + handlePartitionContainer() + handleOverlayContainer().
 */

export const LAYOUT_ANALYZER_JS = /* js */ `
function analyzeLayout(domCopy, getNodeInfo, isVisible) {
  const viewportArea = window.innerWidth * window.innerHeight;

  function hasOverlap(items) {
    return items.some((a, i) =>
      items.slice(i+1).some(b => {
        const r1 = a.rect, r2 = b.rect;
        if (!r1.width || !r2.width || !r1.height || !r2.height) return false;
        const epsilon = 1;
        const x1 = r1.x !== undefined ? r1.x : r1.left;
        const y1 = r1.y !== undefined ? r1.y : r1.top;
        const x2 = r2.x !== undefined ? r2.x : r2.left;
        const y2 = r2.y !== undefined ? r2.y : r2.top;
        return !(x1 + r1.width <= x2 + epsilon || x1 >= x2 + r2.width - epsilon ||
            y1 + r1.height <= y2 + epsilon || y1 >= y2 + r2.height - epsilon);
      })
    );
  }

  function containsButton(container) {
    if (container.querySelector('button, input[type="button"], input[type="submit"], [role="button"]')) return true;
    if (container.querySelector('[class*="-btn"], [class*="-button"], .button, .btn, [class*="btn-"]')) return true;
    return false;
  }

  function handlePartitionContainer(childrenInfo, pathType) {
    childrenInfo.sort((a, b) => b.area - a.area);
    const totalArea = childrenInfo.reduce((sum, item) => sum + item.area, 0);
    const hasMainElement = childrenInfo.length >= 1 &&
                          (childrenInfo[0].area / totalArea > 0.5) &&
                          (childrenInfo.length === 1 || childrenInfo[0].area > childrenInfo[1].area * 2);
    if (hasMainElement) {
      childrenInfo[0].node.dataset.mark = 'K:main';
      for (let i = 1; i < childrenInfo.length; i++) {
        const child = childrenInfo[i];
        let className = (child.node.getAttribute('class') || '').toLowerCase();
        let isSecondary = containsButton(child.node);
        if (className.includes('nav')) isSecondary = true;
        if (className.includes('breadcrumbs')) isSecondary = true;
        if (className.includes('header') && className.includes('table')) isSecondary = true;
        if (child.node.innerHTML.trim().replace(/\\s+/g, '').length < 500) isSecondary = true;
        if (child.node.textContent.trim().length > 200) isSecondary = true;
        if (child.style.visibility === 'hidden') isSecondary = false;
        if (isSecondary) child.node.dataset.mark = 'K:secondary';
        else child.node.dataset.mark = 'K:nonEssential';
      }
    }
  }

  function handleOverlayContainer(childrenInfo, pathType) {
    const _efp = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
    if (_efp) {
      let _el = _efp;
      while (_el) {
        const _h = childrenInfo.find(c => c.node.id && c.node.id === _el.id);
        if (_h) { _h.zIndex = 9999; break; }
        _el = _el.parentElement;
      }
    }
    const sorted = [...childrenInfo].sort((a, b) => b.zIndex - a.zIndex);
    if (sorted.length === 0) return;

    const top = sorted[0];
    const rect = top.rect;
    const topNode = top.node;
    const isComplex = top.node.querySelectorAll('input, select, textarea, button, a, [role="button"]').length >= 1;

    const textContent = topNode.textContent?.trim() || '';
    const textLength = textContent.length;
    const hasLinks = topNode.querySelectorAll('a').length > 0;
    const isMostlyText = textLength > 7 && !hasLinks;

    const centerDiff = Math.abs((rect.left + rect.width/2) - window.innerWidth/2) / window.innerWidth;
    const minDimensionRatio = Math.min(rect.width / window.innerWidth, rect.height / window.innerHeight);
    const maxDimensionRatio = Math.max(rect.width / window.innerWidth, rect.height / window.innerHeight);
    const isNearTop = rect.top < 50;
    const isDialog = (top.node.querySelector('iframe') || top.node.querySelector('button') || top.node.querySelector('input')) && centerDiff < 0.3;

    if (isComplex && centerDiff < 0.2 &&
        ((minDimensionRatio > 0.2 && rect.width/window.innerWidth < 0.98) || minDimensionRatio > 0.95)) {
      top.node.dataset.mark = 'K:mainInteractive';
      sorted.slice(1).forEach(e => {
        if ((parseInt(e.zIndex)||0) <= (parseInt(sorted[0].zIndex)||0)) {
          e.node.dataset.mark = 'R:covered';
        } else {
          e.node.dataset.mark = 'K:noncovered';
        }
      });
    } else {
      if (isComplex && isNearTop && maxDimensionRatio > 0.4 && top.isVisible) {
        top.node.dataset.mark = 'K:topBar';
      } else if (isMostlyText || isComplex || isDialog) {
        topNode.dataset.mark = 'K:messageContent';
      } else {
        topNode.dataset.mark = 'R:floatingAd';
      }
      const rest = sorted.slice(1);
      if (rest.length) {
        if (!hasOverlap(rest)) handlePartitionContainer(rest, pathType);
        else handleOverlayContainer(rest, pathType);
      }
    }
  }

  function analyzeNode(node, pPathType) {
    pPathType = pPathType || 'main';
    if (node.nodeType !== 1 || !node.children.length) {
      if (node.nodeType === 1) node.dataset.mark = 'K:leaf';
      return;
    }
    const pathType = (node.dataset.mark === 'K:secondary') ? 'second' : pPathType;
    const nodeInfoData = getNodeInfo(node);
    if (!nodeInfoData || !nodeInfoData.rect) return;
    const rectn = nodeInfoData.rect;
    if (rectn.width < window.innerWidth * 0.8 && rectn.height < window.innerHeight * 0.8) return node;
    if (node.tagName === 'TABLE') return;
    const children = Array.from(node.children);
    if (children.length === 1) {
      node.dataset.mark = 'K:container';
      return analyzeNode(children[0], pathType);
    }
    if (children.length > 10) return;

    const childrenInfo = children.map(child => {
      const info = getNodeInfo(child) || { rect: {}, style: {} };
      return { node: child, rect: info.rect, style: info.style,
          area: info.area, zIndex: (info.zIndex || 0), isVisible: info.isVisible };
    });
    childrenInfo.sort((a, b) => b.area - a.area);

    const isOverlay = hasOverlap(childrenInfo);
    node.dataset.mark = isOverlay ? 'K:overlayParent' : 'K:partitionParent';

    if (isOverlay) handleOverlayContainer(childrenInfo, pathType);
    else handlePartitionContainer(childrenInfo, pathType);

    for (const child of children)
      if (!child.dataset.mark || child.dataset.mark[0] !== 'R') analyzeNode(child, pathType);
  }

  // Hoist top 1-2 deep fixed dialogs to body level
  const _fc = [...domCopy.querySelectorAll('*')].filter(el => {
    if (el.parentNode === domCopy) return false;
    const info = getNodeInfo(el);
    if (!info?.rect || info.style.position !== 'fixed') return false;
    const r = info.rect, cover = (r.width * r.height) / viewportArea;
    const cd = Math.abs((r.left + r.width/2) - window.innerWidth/2) / window.innerWidth;
    return cover > 0.15 && cover < 1.0 && cd < 0.3 && el.querySelector('button, input, a, [role="button"], iframe');
  }).filter((el, _, arr) => !arr.some(o => o !== el && o.contains(el)))
    .sort((a, b) => (getNodeInfo(b).rect.width * getNodeInfo(b).rect.height) - (getNodeInfo(a).rect.width * getNodeInfo(a).rect.height))
    .slice(0, 2);
  _fc.forEach(el => { el.parentNode.removeChild(el); domCopy.appendChild(el); });

  analyzeNode(domCopy);

  // Remove marked-for-removal nodes
  domCopy.querySelectorAll('[data-mark^="R:"]').forEach(el => el.parentNode?.removeChild(el));

  // Unwrap single-child containers
  let root = domCopy;
  while (root.children.length === 1) root = root.children[0];

  // Remove empty DIVs (3 passes)
  for (let ii = 0; ii < 3; ii++) {
    root.querySelectorAll('div').forEach(div => {
      if (!div.textContent.trim() && div.children.length === 0) div.remove();
    });
  }

  // Clean data-mark attributes
  root.querySelectorAll('[data-mark]').forEach(e => e.removeAttribute('data-mark'));
  root.removeAttribute('data-mark');

  // Convert iframes with content to divs
  root.querySelectorAll('iframe').forEach(f => {
    if (f.children.length) {
      const d = document.createElement('div');
      for (const a of f.attributes) d.setAttribute(a.name, a.value);
      d.setAttribute('data-tag', 'iframe');
      while (f.firstChild) d.appendChild(f.firstChild);
      f.parentNode.replaceChild(d, f);
    }
  });

  return root.outerHTML;
}
analyzeLayout(domCopy, getNodeInfo, isVisible);
`;
