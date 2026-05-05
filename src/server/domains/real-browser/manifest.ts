import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { realBrowserTools } from '@server/domains/real-browser/definitions';
import type { RealBrowserToolHandlers } from '@server/domains/real-browser/index';

const DOMAIN = 'real-browser' as const;
const DEP_KEY = 'realBrowserHandlers' as const;
type H = RealBrowserToolHandlers;
const t = toolLookup(realBrowserTools);
const registrations = defineMethodRegistrations<H, (typeof realBrowserTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  entries: [
    { tool: 'real_browser_setup_status', method: 'handleSetupStatus' },
    { tool: 'real_browser_list_tabs', method: 'handleListTabs' },
    { tool: 'real_browser_switch_tab', method: 'handleSwitchTab' },
    { tool: 'real_browser_open_url', method: 'handleOpenUrl' },
    { tool: 'real_browser_open_new_tab', method: 'handleOpenNewTab' },
    { tool: 'real_browser_extension_path', method: 'handleExtensionPath' },
    { tool: 'real_browser_execute_js', method: 'handleExecuteJs' },
    { tool: 'real_browser_scan_page', method: 'handleScanPage' },
    { tool: 'real_browser_cdp_command', method: 'handleCdpCommand' },
    { tool: 'real_browser_cdp_batch', method: 'handleCdpBatch' },
    { tool: 'real_browser_cookies', method: 'handleCookies' },
    { tool: 'real_browser_screenshot', method: 'handleScreenshot' },
    { tool: 'real_browser_snapshot', method: 'handleSnapshot' },
    { tool: 'real_browser_click', method: 'handleClick' },
    { tool: 'real_browser_fill', method: 'handleFill' },
    { tool: 'real_browser_hover', method: 'handleHover' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { TMWebDriverClient, ExtensionManager } = await import('@modules/tmwebdriver');
  const { RealBrowserToolHandlers } = await import('@server/domains/real-browser/index');

  if (!(ctx as unknown as Record<string, unknown>).realBrowserHandlers) {
    const extManager = new ExtensionManager();
    const client = new TMWebDriverClient();
    await client.start();

    (ctx as unknown as Record<string, unknown>).realBrowserHandlers = new RealBrowserToolHandlers(
      client,
      extManager,
    );
  }
  return (ctx as unknown as Record<string, unknown>).realBrowserHandlers as H;
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
      /(real.?browser|chrome.?extension|tmwebdriver|真实浏览器)/i,
      /(login.?state|logged.?in|authenticated.?session|登录态)/i,
    ],
    priority: 85,
    tools: [
      'real_browser_setup_status',
      'real_browser_scan_page',
      'real_browser_execute_js',
      'real_browser_list_tabs',
    ],
    hint: "Real browser automation: connect to user's existing Chrome via extension bridge → scan page → execute JS",
  },

  prerequisites: {},

  registrations,
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
