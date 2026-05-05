import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const siteAdapterTools: Tool[] = [
  tool('site_list', (t) =>
    t
      .desc(
        'List all available site adapters. Returns name, domain, description for each adapter. ' +
          'Adapters are JS functions that run in your browser to extract structured data using your login state.',
      )
      .enum(
        'category',
        ['all', 'search', 'social', 'news', 'dev', 'video', 'finance', 'jobs', 'knowledge'],
        'Filter by category',
        {
          default: 'all',
        },
      ),
  ),

  tool('site_info', (t) =>
    t
      .desc('Show detailed info about a site adapter: metadata, args schema, domain, capabilities.')
      .string('name', 'Adapter name (e.g. "reddit/me", "twitter/search")')
      .required('name'),
  ),

  tool('site_run', (t) =>
    t
      .desc(
        'Execute a site adapter in the browser. The adapter runs as JS in your tab, ' +
          'using your login state to fetch structured data. Returns JSON result.',
      )
      .string('name', 'Adapter name (e.g. "reddit/me", "github/search")')
      .string('args', 'Adapter arguments as JSON string (see site_info for schema)')
      .string('sessionId', 'TMWebDriver session ID (tab to run in)')
      .required('name'),
  ),

  tool('site_search', (t) =>
    t
      .desc('Search adapters by keyword. Matches against name, description, and domain.')
      .string('query', 'Search keyword')
      .required('query'),
  ),

  tool('site_update', (t) =>
    t
      .desc(
        'Update site adapters from the bb-sites GitHub repo. ' +
          'Downloads latest adapters and regenerates the index.',
      )
      .idempotent(),
  ),
];
