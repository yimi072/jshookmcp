import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { siteAdapterTools } from '@server/domains/site-adapter/definitions';
import type { SiteAdapterToolHandlers } from '@server/domains/site-adapter/index';

const DOMAIN = 'site-adapter' as const;
const DEP_KEY = 'siteAdapterHandlers' as const;
type H = SiteAdapterToolHandlers;
const t = toolLookup(siteAdapterTools);
const registrations = defineMethodRegistrations<H, (typeof siteAdapterTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  entries: [
    { tool: 'site_list', method: 'handleSiteList' },
    { tool: 'site_info', method: 'handleSiteInfo' },
    { tool: 'site_run', method: 'handleSiteRun' },
    { tool: 'site_search', method: 'handleSiteSearch' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { TMWebDriverClient } = await import('@modules/tmwebdriver');
  const { SiteAdapterToolHandlers } = await import('@server/domains/site-adapter/index');

  if (!(ctx as unknown as Record<string, unknown>).siteAdapterHandlers) {
    const client = new TMWebDriverClient();
    await client.start();

    (ctx as unknown as Record<string, unknown>).siteAdapterHandlers = new SiteAdapterToolHandlers({
      tmwdClient: client,
    });
  }
  return (ctx as unknown as Record<string, unknown>).siteAdapterHandlers as H;
}

const manifest = {
  kind: 'domain-manifest',
  version: 1,
  domain: DOMAIN,
  depKey: DEP_KEY,
  profiles: ['search', 'workflow', 'full'],
  ensure,

  workflowRule: {
    patterns: [
      /site.*(adapter|plugin|scrape|extract)/i,
      /(adapter|站点|适配器).*(run|list|search|运行|列表)/i,
      /(reddit|twitter|github|zhihu|bilibili|weibo).*(data|info|me|search|数据)/i,
    ],
    priority: 90,
    tools: ['site_list', 'site_run', 'site_search'],
    hint: 'Site adapters: use your browser login state to extract structured data from 36+ platforms',
  },

  prerequisites: {
    site_run: [
      {
        condition: 'TMWebDriver must be running with Chrome extension connected',
        fix: 'Load the TMWD extension in Chrome and ensure TMWebDriver is running',
      },
    ],
  },

  registrations,
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
