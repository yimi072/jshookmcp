# Real Browser

Domain: `real-browser`

Real browser control domain via Chrome extension, preserving user login state.

## Profiles

- search
- workflow
- full

## Typical scenarios

- Real browser control
- Automation with preserved login
- Multi-tab management

## Common combinations

- real-browser + site-adapter
- real-browser + browser

## Representative tools

- `real_browser_setup_status` — Return extension path, bridge ports, and connection status for the real Chrome bridge.
- `real_browser_list_tabs` — List currently connected real Chrome browser tabs/sessions.
- `real_browser_switch_tab` — Set the active real Chrome tab by session ID or URL substring.
- `real_browser_open_url` — Navigate the current real Chrome tab to a URL.
- `real_browser_open_new_tab` — Open a new tab in the real Chrome browser.
- `real_browser_extension_path` — Get the absolute path to the bundled Chrome extension directory.
- `real_browser_execute_js` — Execute JavaScript in a real Chrome page context via the extension bridge.
- `real_browser_scan_page` — Scan the real Chrome page: extract simplified HTML with visibility analysis and list truncation.
- `real_browser_cdp_command` — Send a single Chrome DevTools Protocol command via the extension bridge.
- `real_browser_cdp_batch` — Run a batch of CDP commands via the extension bridge. Supports $N.path references to previous results.

## Full tool list (16)

| Tool | Description |
| --- | --- |
| `real_browser_setup_status` | Return extension path, bridge ports, and connection status for the real Chrome bridge. |
| `real_browser_list_tabs` | List currently connected real Chrome browser tabs/sessions. |
| `real_browser_switch_tab` | Set the active real Chrome tab by session ID or URL substring. |
| `real_browser_open_url` | Navigate the current real Chrome tab to a URL. |
| `real_browser_open_new_tab` | Open a new tab in the real Chrome browser. |
| `real_browser_extension_path` | Get the absolute path to the bundled Chrome extension directory. |
| `real_browser_execute_js` | Execute JavaScript in a real Chrome page context via the extension bridge. |
| `real_browser_scan_page` | Scan the real Chrome page: extract simplified HTML with visibility analysis and list truncation. |
| `real_browser_cdp_command` | Send a single Chrome DevTools Protocol command via the extension bridge. |
| `real_browser_cdp_batch` | Run a batch of CDP commands via the extension bridge. Supports $N.path references to previous results. |
| `real_browser_cookies` | Get cookies for the current real Chrome page. |
| `real_browser_screenshot` | Capture a screenshot of the real Chrome page via CDP. |
| `real_browser_snapshot` | Get an accessibility tree snapshot of the page with @ref numbers for interactive elements. Use the ref numbers with real_browser_click/fill/hover to interact with elements. |
| `real_browser_click` | Click an element by its @ref number from a previous snapshot. |
| `real_browser_fill` | Fill an input/textarea by its @ref number from a previous snapshot. |
| `real_browser_hover` | Hover an element by its @ref number from a previous snapshot. |
