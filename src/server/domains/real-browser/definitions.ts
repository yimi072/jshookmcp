import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const realBrowserTools: Tool[] = [
  tool('real_browser_setup_status', (t) =>
    t
      .desc('Return extension path, bridge ports, and connection status for the real Chrome bridge.')
      .readOnly(),
  ),

  tool('real_browser_list_tabs', (t) =>
    t
      .desc('List currently connected real Chrome browser tabs/sessions.')
      .readOnly(),
  ),

  tool('real_browser_switch_tab', (t) =>
    t
      .desc('Set the active real Chrome tab by session ID or URL substring.')
      .string('sessionId', 'Exact session/tab ID')
      .string('urlPattern', 'URL substring to match')
      .idempotent(),
  ),

  tool('real_browser_open_url', (t) =>
    t
      .desc('Navigate the current real Chrome tab to a URL.')
      .string('url', 'Target URL')
      .string('sessionId', 'Session ID (uses default if omitted)')
      .number('timeout', 'Navigation timeout in ms', { default: 15000 })
      .requiredOpenWorld('url'),
  ),

  tool('real_browser_open_new_tab', (t) =>
    t
      .desc('Open a new tab in the real Chrome browser.')
      .string('url', 'URL to open')
      .requiredOpenWorld('url'),
  ),

  tool('real_browser_extension_path', (t) =>
    t
      .desc('Get the absolute path to the bundled Chrome extension directory.')
      .readOnly(),
  ),

  tool('real_browser_execute_js', (t) =>
    t
      .desc('Execute JavaScript in a real Chrome page context via the extension bridge.')
      .string('script', 'JavaScript code to execute')
      .string('sessionId', 'Session ID (uses default if omitted)')
      .number('timeout', 'Execution timeout in ms', { default: 15000 })
      .requiredOpenWorld('script'),
  ),

  tool('real_browser_scan_page', (t) =>
    t
      .desc('Scan the real Chrome page: extract simplified HTML with visibility analysis and list truncation.')
      .string('sessionId', 'Session ID')
      .boolean('textOnly', 'Return plain text instead of HTML', { default: false })
      .boolean('cutlist', 'Enable list detection and truncation', { default: true })
      .number('maxChars', 'Max output characters', { default: 35000 })
      .string('instruction', 'Keyword hint for list item matching')
      .openWorld(),
  ),

  tool('real_browser_cdp_command', (t) =>
    t
      .desc('Send a single Chrome DevTools Protocol command via the extension bridge.')
      .string('method', 'CDP method name (e.g. Page.captureScreenshot)')
      .string('paramsJson', 'JSON-encoded CDP parameters', { default: '{}' })
      .string('sessionId', 'Session ID')
      .number('tabId', 'Chrome tab ID')
      .requiredOpenWorld('method'),
  ),

  tool('real_browser_cdp_batch', (t) =>
    t
      .desc(
        'Run a batch of CDP commands via the extension bridge. ' +
        'Supports $N.path references to previous results.',
      )
      .object(
        'commands',
        {
          type: { type: 'string', const: 'array' },
          items: {
            type: 'object',
            properties: {
              cmd: { type: 'string', description: 'Command type: cdp, cookies, tabs' },
              method: { type: 'string', description: 'CDP method (for cmd=cdp)' },
              params: { type: 'object', description: 'CDP params' },
            },
          },
        },
        'Array of command objects',
      )
      .number('tabId', 'Chrome tab ID')
      .string('sessionId', 'Session ID')
      .requiredOpenWorld('commands'),
  ),

  tool('real_browser_cookies', (t) =>
    t
      .desc('Get cookies for the current real Chrome page.')
      .string('sessionId', 'Session ID')
      .number('tabId', 'Chrome tab ID')
      .readOnly(),
  ),

  tool('real_browser_screenshot', (t) =>
    t
      .desc('Capture a screenshot of the real Chrome page via CDP.')
      .string('sessionId', 'Session ID')
      .number('tabId', 'Chrome tab ID')
      .enum('format', ['png', 'jpeg'], 'Image format', { default: 'png' })
      .string('savePath', 'File path to save the screenshot')
      .openWorld(),
  ),

  tool('real_browser_snapshot', (t) =>
    t
      .desc(
        'Get an accessibility tree snapshot of the page with @ref numbers for interactive elements. ' +
          'Use the ref numbers with real_browser_click/fill/hover to interact with elements.',
      )
      .string('sessionId', 'Session ID')
      .number('maxDepth', 'Max tree depth', { default: 15 })
      .readOnly(),
  ),

  tool('real_browser_click', (t) =>
    t
      .desc('Click an element by its @ref number from a previous snapshot.')
      .number('ref', 'Element ref number from snapshot (e.g. 3 from [#3])')
      .string('sessionId', 'Session ID')
      .required('ref'),
  ),

  tool('real_browser_fill', (t) =>
    t
      .desc('Fill an input/textarea by its @ref number from a previous snapshot.')
      .number('ref', 'Element ref number from snapshot')
      .string('text', 'Text to type into the element')
      .string('sessionId', 'Session ID')
      .required('ref')
      .requiredOpenWorld('text'),
  ),

  tool('real_browser_hover', (t) =>
    t
      .desc('Hover an element by its @ref number from a previous snapshot.')
      .number('ref', 'Element ref number from snapshot')
      .string('sessionId', 'Session ID')
      .required('ref'),
  ),
];
