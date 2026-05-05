/**
 * Browser-side list container discovery.
 *
 * Port of agent-browser-mcp's simphtml.py::findMainList().
 * Finds the main list containers in a page (feed, search results, etc.)
 * using a scoring system based on child count, area ratio, uniformity, and layout.
 */

export const LIST_FINDER_JS = /* js */ `
function findMainList(startElement) {
  const root = startElement || document.body;
  const MIN_CHILDREN = 8;
  const MAX_CONTAINERS = 20;

  // Global scan: collect candidate containers
  const candidates = [];
  const allEls = root.querySelectorAll('*');
  for (const node of allEls) {
    if (node.closest('svg')) continue;
    const l1 = node.children.length;
    if (l1 < 5) continue;
    let l2 = 0;
    for (const child of node.children) l2 += child.children.length;
    const score = l1 + l2 * 0.1;
    if (score >= MIN_CHILDREN) candidates.push({node, score});
  }
  candidates.sort((a, b) => b.score - a.score);
  const toProcess = candidates.slice(0, MAX_CONTAINERS).map(c => c.node);

  // Find candidate groups and score them
  let allCandidates = [];
  for (const container of toProcess) {
    const topGroups = findTopGroups(container, 3);
    for (const groupInfo of topGroups) {
      const items = findMatchingElements(container, groupInfo.selector);
      if (items.length >= 5) {
        const score = scoreContainer(container, items) + groupInfo.score;
        if (score >= 30) {
          allCandidates.push({ container, selector: groupInfo.selector, items, score });
        }
      }
    }
  }

  allCandidates.sort((a, b) => b.score - a.score);

  // Dedup: remove results with >50% overlap with higher-scored candidates
  const kept = [];
  for (const cand of allCandidates) {
    let dominated = false;
    for (const k of kept) {
      if (k.container.contains(cand.container) || cand.container.contains(k.container)) {
        const kSet = new Set(k.items);
        const overlap = cand.items.filter(it => kSet.has(it)).length;
        if (overlap > cand.items.length * 0.5) { dominated = true; break; }
      }
    }
    if (!dominated) kept.push(cand);
  }

  function describeResult(container, items, selector, score) {
    if (container && !container.id) container.id = '_ljq' + (window._lci = (window._lci || 0) + 1);
    const cTag = container ? container.tagName : null;
    const cId = container ? (container.id || '') : '';
    const cClass = container ? (String(container.className || '').trim()) : '';
    const result = {
      containerTag: cTag, containerId: cId, containerClass: cClass,
      itemCount: items.length,
    };
    let prefix = '';
    if (cId) prefix = '#' + CSS.escape(cId);
    if (selector) result.selector = prefix ? (prefix + ' > ' + selector) : selector;
    if (score !== undefined) result.score = score;
    if (items.length > 0) {
      result.firstItemPreview = items[0].outerHTML.substring(0, 200);
      result.itemTags = items.slice(0, 10).map(el => el.tagName + (el.className ? '.' + String(el.className).trim().split(/\\s+/)[0] : ''));
    }
    return result;
  }

  if (kept.length === 0) return [];
  return kept.map(c => describeResult(c.container, c.items, c.selector, c.score));
}

function findTopGroups(container, limit) {
  const children = Array.from(container.children).filter(c => !c.closest('svg'));
  const totalChildren = children.length;
  if (totalChildren < 3) return [];
  const minGroupSize = Math.max(3, Math.floor(totalChildren * 0.2));
  const groups = [];
  const tagFreq = {}, classFreq = {}, tagMap = {}, classMap = {};

  children.forEach(child => {
    const tag = child.tagName.toLowerCase();
    if (tag === 'td') return;
    tagFreq[tag] = (tagFreq[tag] || 0) + 1;
    if (!tagMap[tag]) tagMap[tag] = [];
    tagMap[tag].push(child);
    if (child.className) {
      child.className.trim().split(/\\s+/).forEach(cls => {
        if (cls) {
          classFreq[cls] = (classFreq[cls] || 0) + 1;
          if (!classMap[cls]) classMap[cls] = [];
          classMap[cls].push(child);
        }
      });
    }
  });

  const scoreGroup = (selector, elements) => {
    const coverage = elements.length / totalChildren;
    let specificity = selector.startsWith('.')
      ? (0.6 + (selector.match(/\\./g).length - 1) * 0.1)
      : (selector.includes('.')
         ? (0.7 + (selector.match(/\\./g).length) * 0.1)
         : 0.3);
    return (coverage * 0.5) + (specificity * 0.5);
  };

  // Tag groups
  Object.keys(tagFreq).forEach(tag => {
    if (tag !== 'div' && tagFreq[tag] >= minGroupSize) {
      groups.push({ selector: tag, elements: tagMap[tag], score: scoreGroup(tag, tagMap[tag]) - 0.5 });
    }
  });

  // Class groups
  Object.keys(classFreq).forEach(cls => {
    if (classFreq[cls] >= minGroupSize) {
      const selector = '.' + CSS.escape(cls);
      groups.push({ selector, elements: classMap[cls], score: scoreGroup(selector, classMap[cls]) });
    }
  });

  // Tag+class combinations
  const topTags = Object.keys(tagFreq).filter(t => tagFreq[t] >= minGroupSize).slice(0, 3);
  const topClasses = Object.keys(classFreq).filter(c => classFreq[c] >= minGroupSize).sort((a, b) => classFreq[b] - classFreq[a]).slice(0, 3);
  topTags.forEach(tag => {
    topClasses.forEach(cls => {
      const elements = children.filter(el => el.tagName.toLowerCase() === tag && el.className && el.className.split(/\\s+/).includes(cls));
      if (elements.length >= minGroupSize) {
        const selector = tag + '.' + CSS.escape(cls);
        groups.push({selector, elements, score: scoreGroup(selector, elements)});
      }
    });
  });

  // Multi-class combinations
  for (let i = 0; i < topClasses.length; i++) {
    for (let j = i + 1; j < topClasses.length; j++) {
      const elements = children.filter(el => el.className && el.className.split(/\\s+/).includes(topClasses[i]) && el.className.split(/\\s+/).includes(topClasses[j]));
      if (elements.length >= minGroupSize) {
        const selector = '.' + CSS.escape(topClasses[i]) + '.' + CSS.escape(topClasses[j]);
        groups.push({selector, elements, score: scoreGroup(selector, elements)});
      }
    }
  }

  return groups.sort((a, b) => b.score - a.score).slice(0, limit);
}

function findMatchingElements(container, selector) {
  try { return Array.from(container.querySelectorAll(selector)); }
  catch (e) { return []; }
}

function scoreContainer(container, items) {
  if (!container || items.length < 3) return 0;
  const containerRect = container.getBoundingClientRect();
  const containerArea = containerRect.width * containerRect.height;
  if (containerArea < 10000) return 0;

  const itemAreas = [];
  let totalItemArea = 0, visibleItems = 0;
  items.forEach(item => {
    const rect = item.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0) { totalItemArea += area; itemAreas.push(area); visibleItems++; }
  });
  if (visibleItems < 3) return 0;
  totalItemArea = Math.min(totalItemArea, containerArea * 0.98);
  const areaRatio = totalItemArea / containerArea;

  const areaScore = 40 / (1 + Math.exp(-12 * (areaRatio - 0.4)));

  let uniformityScore = 0;
  if (itemAreas.length >= 3) {
    const mean = itemAreas.reduce((sum, area) => sum + area, 0) / itemAreas.length;
    const variance = itemAreas.reduce((sum, area) => sum + Math.pow(area - mean, 2), 0) / itemAreas.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    uniformityScore = 20 * Math.exp(-2.5 * cv);
  }

  const baseScore = Math.log2(visibleItems) * 5 + Math.floor(visibleItems / 5) * 0.25;
  const rawCountScore = Math.min(40, baseScore);
  const countScore = rawCountScore * Math.max(0.1, uniformityScore / 20);

  const viewportArea = window.innerWidth * window.innerHeight;
  const containerViewportRatio = containerArea / viewportArea;
  const sizeScore = 2 * (1 - 1/(1 + Math.exp(-10 * (containerViewportRatio - 0.25))));

  let layoutScore = 0;
  if (items.length >= 3) {
    const uniqueRows = new Set(items.map(item => Math.round(item.getBoundingClientRect().top / 5) * 5)).size;
    const uniqueCols = new Set(items.map(item => Math.round(item.getBoundingClientRect().left / 5) * 5)).size;
    if (uniqueRows === 1 || uniqueCols === 1) { layoutScore = 20; }
    else {
      const coverage = Math.min(1, items.length / (uniqueRows * uniqueCols));
      const efficiency = Math.max(0, 1 - (uniqueRows + uniqueCols) / (2 * items.length));
      layoutScore = 20 * (0.7 * coverage + 0.3 * efficiency);
    }
  }

  return countScore + areaScore + uniformityScore + layoutScore + sizeScore;
}
JSON.stringify(findMainList(document.body));
`;
