# Plan: Port agent-browser-mcp Features to jshookmcp

## Overview

Port 6 capabilities from `agent-browser-mcp` (Python) into `jshookmcp` (TypeScript), following jshookmcp's domain-based architecture with auto-discovery.

## Architecture Reference

jshookmcp domain pattern:
- `src/server/domains/<domain>/manifest.ts` — domain manifest with tool registrations
- `src/server/domains/<domain>/definitions.ts` — tool definitions (fluent `tool()` builder)
- `src/server/domains/<domain>/handlers.impl.ts` — handler class exports
- `src/server/domains/<domain>/handlers/` — handler implementations
- `src/server/domains/<domain>/index.ts` — re-exports
- `src/modules/<module>/` — core logic (not domain-specific)
- `scripts/generate-domains-index.mjs` — auto-discovers domains at build time

---

## Phase 1: TMWebDriver Module (core infrastructure)

### 1.1 `src/modules/tmwebdriver/TMWebDriverClient.ts`
Port `agent-browser-mcp/tmwebdriver.py` Session + TMWebDriver class to TypeScript.

- WebSocket client that connects to `ws://127.0.0.1:18765`
- HTTP long-polling fallback (`http://127.0.0.1:18766/api/longpoll`)
- Session management (register, reconnect, disconnect, clean stale)
- `executeJs(code, timeout, sessionId)` — send JS to Chrome extension, wait for result with ACK tracking
- `getSessions()` — list active browser tabs
- `findSession(urlPattern)` — find session by URL substring
- `setSession(urlPattern)` — set default session
- `jump(url)` / `newTab(url)` — navigation helpers
- Remote mode support (forward commands to another TMWebDriver instance)

Key types:
```typescript
interface TMWebDriverSession {
  id: string;
  url: string;
  title: string;
  connectedAt: number;
  type: 'ws' | 'ext_ws' | 'http';
}

interface TMWebDriverConfig {
  host?: string;   // default '127.0.0.1'
  port?: number;   // default 18765
  remoteMode?: boolean;
}
```

### 1.2 `src/modules/tmwebdriver/types.ts`
Shared types for the TMWebDriver module.

### 1.3 `src/modules/tmwebdriver/index.ts`
Re-exports.

---

## Phase 2: DOM Intelligence Module (page scanning algorithms)

### 2.1 `src/modules/dom-intel/visibility-clone.ts`
Port `simphtml.py::createEnhancedDOMCopy()` → `createEnhancedDOMCopy()`.

- Recursive DOM clone that skips invisible elements
- Per-node metadata: rect, area, isVisible, zIndex, style
- iframe content extraction (cross-origin fallback)
- shadow DOM traversal
- Input value/checked state preservation
- Autofill detection (`:-webkit-autofill`)
- Dropdown detection (small menus kept visible)

### 2.2 `src/modules/dom-intel/layout-analyzer.ts`
Port `simphtml.py::analyzeNode()` + `handlePartitionContainer()` + `handleOverlayContainer()`.

- `analyzeNode(node)` — recursive layout analysis
- Detect partition vs overlay containers
- Mark nodes: `K:main`, `K:secondary`, `K:nonEssential`, `K:container`, `K:overlayParent`, `K:partitionParent`, `K:mainInteractive`, `K:topBar`, `K:messageContent`, `R:covered`, `R:floatingAd`, `R:equalmany`
- `elementFromPoint` ground truth for top-layer detection
- Fixed dialog hoisting (deep fixed elements → body level)

### 2.3 `src/modules/dom-intel/list-finder.ts`
Port `simphtml.py::findMainList()`.

- Global scan for candidate containers (5+ children)
- `findTopGroups(container)` — group by tag/class combinations
- `scoreContainer(container, items)` — scoring: count, area ratio, uniformity, layout, size
- Deduplication (50% overlap threshold)
- Returns: containerTag, containerId, selector, itemCount, score

### 2.4 `src/modules/dom-intel/token-optimizer.ts`
Port `simphtml.py::optimize_html_for_tokens()` + `smart_truncate()`.

- Strip style attributes, SVG content
- Truncate long src/href/action/alt/title/value
- Compress data-* attributes
- `smartTruncate(soup, budget)` — recursive proportional truncation
- FAKE ELEMENT hint injection for hidden lists

### 2.5 `src/modules/dom-intel/page-scanner.ts`
High-level orchestrator that combines all above modules.

- `scanPage(options)` — full pipeline: clone → analyze → optimize → truncate
- `scanPageText(options)` — text-only mode (block-level newlines, form field descriptions)
- `findMainLists(options)` — find primary list containers
- `diffPages(beforeHtml, afterHtml)` — DOM change detection
- `startTransientMonitor()` / `getTransientTexts()` — text change monitoring

### 2.6 `src/modules/dom-intel/types.ts`
Shared types.

### 2.7 `src/modules/dom-intel/index.ts`
Re-exports.

---

## Phase 3: Real Browser Domain (new MCP domain)

### 3.1 `src/server/domains/real-browser/definitions.ts`
Tool definitions using fluent `tool()` builder:

| Tool | Description | Key Params |
|------|-------------|------------|
| `real_browser_setup_status` | Extension path, bridge ports, connection status | — |
| `real_browser_list_tabs` | List connected Chrome tabs | — |
| `real_browser_switch_tab` | Set active tab by id or URL pattern | `sessionId?`, `urlPattern?` |
| `real_browser_open_url` | Navigate current tab | `url`, `sessionId?` |
| `real_browser_open_new_tab` | Open new tab | `url` |
| `real_browser_extension_path` | Get Chrome extension directory path | — |
| `real_browser_execute_js` | Execute JS in real Chrome page | `script`, `sessionId?`, `timeout?` |
| `real_browser_scan_page` | Scan page with DOM intelligence | `sessionId?`, `textOnly?`, `maxChars?`, `instruction?` |
| `real_browser_cdp_command` | Single CDP command via extension bridge | `method`, `paramsJson?`, `sessionId?` |
| `real_browser_cdp_batch` | Batch CDP commands with $N references | `commands`, `sessionId?` |
| `real_browser_cookies` | Get cookies for current page | `sessionId?` |
| `real_browser_screenshot` | Page screenshot via CDP | `sessionId?`, `format?`, `savePath?` |

### 3.2 `src/server/domains/real-browser/handlers.ts`
Re-exports.

### 3.3 `src/server/domains/real-browser/handlers/real-browser-handlers.ts`
Handler class `RealBrowserToolHandlers`:

```typescript
class RealBrowserToolHandlers {
  constructor(private tmwdClient: TMWebDriverClient) {}

  async handleSetupStatus(args) { ... }
  async handleListTabs(args) { ... }
  async handleSwitchTab(args) { ... }
  async handleOpenUrl(args) { ... }
  async handleOpenNewTab(args) { ... }
  async handleExtensionPath(args) { ... }
  async handleExecuteJs(args) { ... }
  async handleScanPage(args) { ... }       // uses dom-intel module
  async handleCdpCommand(args) { ... }
  async handleCdpBatch(args) { ... }
  async handleCookies(args) { ... }
  async handleScreenshot(args) { ... }
}
```

### 3.4 `src/server/domains/real-browser/handlers.impl.ts`
Export handler class.

### 3.5 `src/server/domains/real-browser/index.ts`
Re-exports.

### 3.6 `src/server/domains/real-browser/manifest.ts`
Domain manifest:
- `domain: 'real-browser'`
- `depKey: 'realBrowserHandlers'`
- `profiles: ['search', 'workflow', 'full']` (search tier — lightweight, no browser launch)
- `ensure()`: create TMWebDriverClient, instantiate handlers
- `workflowRule`: patterns for real browser / Chrome / extension keywords
- `prerequisites`: none (TMWebDriver is self-contained, doesn't need Puppeteer)

---

## Phase 4: DOM Intelligence Domain (new MCP domain)

### 4.1 `src/server/domains/dom-intel/definitions.ts`
Tool definitions:

| Tool | Description | Key Params |
|------|-------------|------------|
| `dom_scan` | Full DOM scan with visibility analysis | `html?`, `url?`, `textOnly?`, `maxChars?`, `instruction?` |
| `dom_find_lists` | Find main list containers in page | `html?`, `url?`, `minItems?` |
| `dom_diff` | Compare two HTML snapshots | `beforeHtml`, `afterHtml` |
| `dom_optimize` | Optimize HTML for token efficiency | `html`, `maxChars?` |
| `dom_extract_text` | Extract clean text from HTML | `html`, `maxChars?` |

### 4.2 `src/server/domains/dom-intel/handlers.ts`
Re-exports.

### 4.3 `src/server/domains/dom-intel/handlers/dom-intel-handlers.ts`
Handler class `DomIntelToolHandlers`:

```typescript
class DomIntelToolHandlers {
  constructor(
    private pageController: PageController,
    private domInspector: DOMInspector,
  ) {}

  async handleDomScan(args) { ... }
  async handleDomFindLists(args) { ... }
  async handleDomDiff(args) { ... }
  async handleDomOptimize(args) { ... }
  async handleDomExtractText(args) { ... }
}
```

### 4.4 `src/server/domains/dom-intel/handlers.impl.ts`
Export handler class.

### 4.5 `src/server/domains/dom-intel/index.ts`
Re-exports.

### 4.6 `src/server/domains/dom-intel/manifest.ts`
Domain manifest:
- `domain: 'dom-intel'`
- `depKey: 'domIntelHandlers'`
- `profiles: ['workflow', 'full']`
- `ensure()`: ensureBrowserCore, create handlers
- `prerequisites`: dom_scan requires browser launched (if url mode)

---

## Phase 5: CDP Batch + Network Capture Enhancements

### 5.1 `src/server/domains/network/definitions.ts` (modify)
Add new tool definitions:

```typescript
tool('cdp_batch', (t) =>
  t.desc('Run batch CDP commands with $N result references.')
   .array('commands', {...}, 'Array of CDP command objects')
   .string('sessionId', 'TMWebDriver session ID (for real-browser mode)')
   .required('commands')
   .openWorld(),
),

tool('network_reload_capture', (t) =>
  t.desc('Attach debugger, enable Network, reload page, capture matching requests.')
   .string('urlSubstring', 'URL substring to match', { default: '/' })
   .number('settleMs', 'Wait time after reload in ms', { default: 8000 })
   .boolean('ignoreCache', 'Ignore cache on reload', { default: true })
   .required('urlSubstring')
   .openWorld(),
),
```

### 5.2 `src/server/domains/network/handlers/` (modify)
Add handler methods:
- `handleCdpBatch(args)` — execute batch CDP commands via Chrome debugger API
- `handleNetworkReloadCapture(args)` — attach → enable Network → reload → wait → capture

### 5.3 `src/server/domains/network/manifest.ts` (modify)
Register new tools in `registrations`.

---

## Phase 6: Doctor CLI Enhancement

### 6.1 `src/cli/doctor.ts` (modify)
Add TMWebDriver diagnostics:
- Check if TMWebDriver port (18765/18766) is open
- Report connected Chrome extension tabs
- Report real-browser domain status
- Add `nextSteps` suggestions array in JSON output

---

## Phase 7: Chrome Extension (bundle)

### 7.1 `src/assets/tmwd-extension/`
Copy and adapt the Chrome extension from `agent-browser-mcp`:
- `manifest.json` — MV3 manifest (already MV3)
- `background.js` — CSP strip, WebSocket bridge, CDP commands
- `content.js` — MutationObserver-based bridge
- `config.js` — auto-generated session token
- `disable_dialogs.js` — suppress alert/confirm/prompt
- `popup.html` / `popup.js` — status popup

### 7.2 `src/modules/tmwebdriver/ExtensionManager.ts`
- `getExtensionPath()` — return bundled extension path
- `ensureConfigJs()` — generate config.js with random TID
- `doctor()` — check extension installation status

---

## File Summary

### New Files (25)

**Modules:**
- `src/modules/tmwebdriver/TMWebDriverClient.ts`
- `src/modules/tmwebdriver/ExtensionManager.ts`
- `src/modules/tmwebdriver/types.ts`
- `src/modules/tmwebdriver/index.ts`
- `src/modules/dom-intel/visibility-clone.ts`
- `src/modules/dom-intel/layout-analyzer.ts`
- `src/modules/dom-intel/list-finder.ts`
- `src/modules/dom-intel/token-optimizer.ts`
- `src/modules/dom-intel/page-scanner.ts`
- `src/modules/dom-intel/types.ts`
- `src/modules/dom-intel/index.ts`

**Real Browser Domain:**
- `src/server/domains/real-browser/manifest.ts`
- `src/server/domains/real-browser/definitions.ts`
- `src/server/domains/real-browser/handlers.ts`
- `src/server/domains/real-browser/handlers.impl.ts`
- `src/server/domains/real-browser/handlers/real-browser-handlers.ts`
- `src/server/domains/real-browser/index.ts`

**DOM Intel Domain:**
- `src/server/domains/dom-intel/manifest.ts`
- `src/server/domains/dom-intel/definitions.ts`
- `src/server/domains/dom-intel/handlers.ts`
- `src/server/domains/dom-intel/handlers.impl.ts`
- `src/server/domains/dom-intel/handlers/dom-intel-handlers.ts`
- `src/server/domains/dom-intel/index.ts`

**Chrome Extension:**
- `src/assets/tmwd-extension/manifest.json`
- `src/assets/tmwd-extension/background.js`
- `src/assets/tmwd-extension/content.js`
- `src/assets/tmwd-extension/disable_dialogs.js`
- `src/assets/tmwd-extension/popup.html`
- `src/assets/tmwd-extension/popup.js`

### Modified Files (4)
- `src/server/domains/network/definitions.ts` — add cdp_batch, network_reload_capture
- `src/server/domains/network/handlers/` — add handler methods
- `src/server/domains/network/manifest.ts` — register new tools
- `src/cli/doctor.ts` — add TMWebDriver diagnostics

---

## Implementation Order

1. **Phase 1** — TMWebDriver Client (standalone, testable)
2. **Phase 7** — Chrome Extension bundle (needed for Phase 1 testing)
3. **Phase 2** — DOM Intelligence Module (standalone, pure TS)
4. **Phase 3** — Real Browser Domain (depends on Phase 1 + 2)
5. **Phase 4** — DOM Intel Domain (depends on Phase 2)
6. **Phase 5** — CDP Batch enhancements (independent)
7. **Phase 6** — Doctor CLI (depends on Phase 1)

## Testing Strategy

- Unit tests for DOM intel algorithms (visibility-clone, layout-analyzer, list-finder, token-optimizer)
- Integration tests for TMWebDriver client (mock WebSocket server)
- E2E tests for real-browser domain (requires Chrome + extension)
- Existing browser domain tests should still pass (no breaking changes)
