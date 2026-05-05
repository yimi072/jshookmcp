import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import {
  defineMethodRegistrations,
  ensureBrowserCore,
  toolLookup,
} from '@server/domains/shared/registry';
import { domIntelTools } from '@server/domains/dom-intel/definitions';
import type { DomIntelToolHandlers } from '@server/domains/dom-intel/index';

const DOMAIN = 'dom-intel' as const;
const DEP_KEY = 'domIntelHandlers' as const;
type H = DomIntelToolHandlers;
const t = toolLookup(domIntelTools);
const registrations = defineMethodRegistrations<H, (typeof domIntelTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  entries: [
    { tool: 'dom_scan', method: 'handleDomScan' },
    { tool: 'dom_find_lists', method: 'handleDomFindLists' },
    { tool: 'dom_diff', method: 'handleDomDiff' },
    { tool: 'dom_optimize', method: 'handleDomOptimize' },
    { tool: 'dom_extract_text', method: 'handleDomExtractText' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { DomIntelToolHandlers } = await import('@server/domains/dom-intel/index');
  await ensureBrowserCore(ctx);

  if (!(ctx as unknown as Record<string, unknown>).domIntelHandlers) {
    (ctx as unknown as Record<string, unknown>).domIntelHandlers = new DomIntelToolHandlers({
      pageController: ctx.pageController!,
      domInspector: ctx.domInspector!,
    });
  }
  return (ctx as unknown as Record<string, unknown>).domIntelHandlers as H;
}

const manifest = {
  kind: 'domain-manifest',
  version: 1,
  domain: DOMAIN,
  depKey: DEP_KEY,
  profiles: ['workflow', 'full'],
  ensure,

  workflowRule: {
    patterns: [
      /(dom|page).?(scan|extract|parse|simplify|read)/i,
      /(html|dom).?(optimize|token|truncat)/i,
      /(页面|dom).?(扫描|提取|解析|简化|读取)/i,
    ],
    priority: 80,
    tools: ['dom_scan', 'dom_find_lists', 'dom_diff'],
    hint: 'DOM intelligence: scan page with visibility analysis → find lists → optimize for tokens',
  },

  prerequisites: {
    dom_scan: [
      {
        condition: 'Browser must be launched',
        fix: 'Call browser_launch or browser_attach first (unless url is provided)',
      },
    ],
    dom_find_lists: [
      { condition: 'Browser must be launched', fix: 'Call browser_launch or browser_attach first' },
    ],
  },

  registrations,
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
