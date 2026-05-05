import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const cdpTools: Tool[] = [
  tool('cdp_batch', (t) =>
    t
      .desc(
        'Run a batch of Chrome DevTools Protocol commands on the current page. ' +
        'Supports $N.path references to access results from previous commands in the batch.',
      )
      .array(
        'commands',
        {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'CDP method (e.g. Network.enable, Page.reload)' },
            params: { type: 'object', description: 'CDP method parameters' },
          },
          required: ['method'],
        },
        'Array of CDP commands to execute in order',
      )
      .requiredOpenWorld('commands'),
  ),

  tool('network_reload_capture', (t) =>
    t
      .desc(
        'Attach Chrome debugger, enable Network domain, reload the page, wait for requests to settle, ' +
        'then return captured requests matching the URL substring. Useful for capturing encrypted API payloads.',
      )
      .string('urlSubstring', 'URL substring to match captured requests', { default: '/' })
      .number('settleMs', 'Time to wait after reload for requests to settle', {
        default: 8000,
        minimum: 500,
        maximum: 120000,
      })
      .boolean('ignoreCache', 'Ignore browser cache on reload', { default: true })
      .requiredOpenWorld('urlSubstring'),
  ),
];
