# Real Browser

域名：`real-browser`

真实浏览器控制域，通过 Chrome 扩展接管用户浏览器（保留登录态）。

## Profile

- search
- workflow
- full

## 典型场景

- 真实浏览器控制
- 保留登录态自动化
- 多标签页管理

## 常见组合

- real-browser + site-adapter
- real-browser + browser

## 代表工具

- `real_browser_setup_status` — 待补充中文：Return extension path, bridge ports, and connection status for the real Chrome bridge.
- `real_browser_list_tabs` — 待补充中文：List currently connected real Chrome browser tabs/sessions.
- `real_browser_switch_tab` — 待补充中文：Set the active real Chrome tab by session ID or URL substring.
- `real_browser_open_url` — 待补充中文：Navigate the current real Chrome tab to a URL.
- `real_browser_open_new_tab` — 待补充中文：Open a new tab in the real Chrome browser.
- `real_browser_extension_path` — 待补充中文：Get the absolute path to the bundled Chrome extension directory.
- `real_browser_execute_js` — 待补充中文：Execute JavaScript in a real Chrome page context via the extension bridge.
- `real_browser_scan_page` — 待补充中文：Scan the real Chrome page: extract simplified HTML with visibility analysis and list truncation.
- `real_browser_cdp_command` — 待补充中文：Send a single Chrome DevTools Protocol command via the extension bridge.
- `real_browser_cdp_batch` — 待补充中文：Run a batch of CDP commands via the extension bridge. Supports $N.path references to previous results.

## 工具清单（16）

| 工具 | 说明 |
| --- | --- |
| `real_browser_setup_status` | 待补充中文：Return extension path, bridge ports, and connection status for the real Chrome bridge. |
| `real_browser_list_tabs` | 待补充中文：List currently connected real Chrome browser tabs/sessions. |
| `real_browser_switch_tab` | 待补充中文：Set the active real Chrome tab by session ID or URL substring. |
| `real_browser_open_url` | 待补充中文：Navigate the current real Chrome tab to a URL. |
| `real_browser_open_new_tab` | 待补充中文：Open a new tab in the real Chrome browser. |
| `real_browser_extension_path` | 待补充中文：Get the absolute path to the bundled Chrome extension directory. |
| `real_browser_execute_js` | 待补充中文：Execute JavaScript in a real Chrome page context via the extension bridge. |
| `real_browser_scan_page` | 待补充中文：Scan the real Chrome page: extract simplified HTML with visibility analysis and list truncation. |
| `real_browser_cdp_command` | 待补充中文：Send a single Chrome DevTools Protocol command via the extension bridge. |
| `real_browser_cdp_batch` | 待补充中文：Run a batch of CDP commands via the extension bridge. Supports $N.path references to previous results. |
| `real_browser_cookies` | 待补充中文：Get cookies for the current real Chrome page. |
| `real_browser_screenshot` | 待补充中文：Capture a screenshot of the real Chrome page via CDP. |
| `real_browser_snapshot` | 待补充中文：Get an accessibility tree snapshot of the page with @ref numbers for interactive elements. Use the ref numbers with real_browser_click/fill/hover to interact with elements. |
| `real_browser_click` | 待补充中文：Click an element by its @ref number from a previous snapshot. |
| `real_browser_fill` | 待补充中文：Fill an input/textarea by its @ref number from a previous snapshot. |
| `real_browser_hover` | 待补充中文：Hover an element by its @ref number from a previous snapshot. |
