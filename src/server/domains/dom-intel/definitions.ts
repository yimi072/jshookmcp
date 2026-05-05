import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const domIntelTools: Tool[] = [
  tool('dom_scan', (t) =>
    t
      .desc(
        'Scan a page: extract simplified HTML with visibility analysis, overlay detection, and list truncation.',
      )
      .string('url', 'URL to navigate and scan (uses current page if omitted)')
      .boolean('textOnly', 'Return plain text instead of HTML', { default: false })
      .boolean('cutlist', 'Enable list detection and truncation', { default: true })
      .number('maxChars', 'Max output characters', { default: 35000 })
      .string('instruction', 'Keyword hint for list item matching')
      .openWorld(),
  ),

  tool('dom_find_lists', (t) =>
    t
      .desc('Find main list containers in the current page (feed, search results, tables).')
      .string('url', 'URL to navigate and analyze')
      .number('minItems', 'Minimum items per list', { default: 5 })
      .query(),
  ),

  tool('dom_diff', (t) =>
    t
      .desc('Compare two HTML snapshots and return the changes.')
      .string('beforeHtml', 'HTML before the change')
      .string('afterHtml', 'HTML after the change')
      .required('beforeHtml', 'afterHtml')
      .query(),
  ),

  tool('dom_optimize', (t) =>
    t
      .desc(
        'Optimize HTML for token efficiency: strip styles, truncate long attributes, compress data-* attributes.',
      )
      .string('html', 'Raw HTML to optimize')
      .number('maxChars', 'Max output characters', { default: 35000 })
      .required('html')
      .query(),
  ),

  tool('dom_extract_text', (t) =>
    t
      .desc('Extract clean text from HTML: collapse whitespace, describe form fields.')
      .string('html', 'HTML to extract text from')
      .number('maxChars', 'Max output characters', { default: 35000 })
      .required('html')
      .query(),
  ),
];
