/**
 * CDP batch and network-reload-capture handlers.
 *
 * These tools operate via the Chrome DevTools Protocol through
 * the collector's CDP session (Puppeteer).
 */

import type { CodeCollector } from '@server/domains/shared/modules';
import { argString, argNumber, argBool } from '@server/domains/shared/parse-args';
import { R } from '@server/domains/shared/ResponseBuilder';
import type { ToolResponse } from '@server/domains/shared/ResponseBuilder';
import { logger } from '@utils/logger';

interface CdpHandlerDeps {
  collector: CodeCollector;
}

interface CdpCommand {
  method: string;
  params?: Record<string, unknown>;
}

export class CdpHandlers {
  constructor(private deps: CdpHandlerDeps) {}

  private async getPage() {
    const browser = this.deps.collector.getBrowser();
    if (!browser) return null;
    const pages = await browser.pages();
    return pages[0] ?? null;
  }

  /**
   * Execute a batch of CDP commands with $N.path result references.
   */
  async handleCdpBatch(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const commands = args.commands as CdpCommand[] | undefined;
      if (!commands || !Array.isArray(commands) || commands.length === 0) {
        return R.fail('commands array is required and must not be empty').build();
      }

      const page = await this.getPage();
      if (!page) return R.fail('No active browser page').build();

      const cdp = await page.createCDPSession();
      const results: unknown[] = [];

      // Resolve $N.path references in params
      const resolveRefs = (obj: unknown): unknown => {
        if (typeof obj === 'string') {
          return obj.replace(/"\$(\d+)\.([^"]+)"/g, (_, idx, path) => {
            const i = Number(idx);
            if (i >= 0 && i < results.length) {
              let val: unknown = results[i];
              for (const key of path.split('.')) {
                if (val && typeof val === 'object') {
                  val = (val as Record<string, unknown>)[key];
                } else {
                  return 'undefined';
                }
              }
              return JSON.stringify(val);
            }
            return 'undefined';
          });
        }
        if (Array.isArray(obj)) return obj.map(resolveRefs);
        if (obj && typeof obj === 'object') {
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            result[k] = resolveRefs(v);
          }
          return result;
        }
        return obj;
      };

      for (const cmd of commands) {
        try {
          const params = resolveRefs(cmd.params ?? {}) as Record<string, unknown>;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await cdp.send(cmd.method as any, params as any);
          results.push(result);
        } catch (err) {
          results.push({ error: (err as Error).message });
        }
      }

      await cdp.detach().catch(() => {});
      return R.ok().build({ results });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  /**
   * Attach debugger, enable Network, reload page, capture matching requests.
   */
  async handleNetworkReloadCapture(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const urlSubstring = argString(args, 'urlSubstring', '/');
      const settleMs = argNumber(args, 'settleMs', 8000);
      const ignoreCache = argBool(args, 'ignoreCache', true);

      const page = await this.getPage();
      if (!page) return R.fail('No active browser page').build();

      const cdp = await page.createCDPSession();
      const captured: Array<{
        url: string;
        method?: string;
        postData?: string;
        requestId?: string;
      }> = [];

      const onEvent = (params: Record<string, unknown>) => {
        const req = (params.request ?? {}) as Record<string, unknown>;
        const url = String(req.url ?? '');
        if (!url.includes(urlSubstring)) return;
        captured.push({
          url: url.split('?')[0] ?? url,
          method: req.method as string | undefined,
          postData: req.postData as string | undefined,
          requestId: params.requestId as string | undefined,
        });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cdp.on('Network.requestWillBeSent' as any, onEvent as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await cdp.send(
        'Network.enable' as any,
        {
          maxTotalBufferSize: 100_000_000,
          maxResourceBufferSize: 50_000_000,
        } as any,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await cdp.send('Page.enable' as any, {} as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await cdp.send('Page.reload' as any, { ignoreCache } as any);

      // Wait for requests to settle
      await new Promise((resolve) => setTimeout(resolve, settleMs));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cdp.off('Network.requestWillBeSent' as any, onEvent as any);
      await cdp.detach().catch(() => {});

      logger.info(
        `[cdp] Captured ${captured.length} requests matching "${urlSubstring}" after ${settleMs}ms`,
      );

      return R.ok().build({
        captured,
        urlSubstring,
        settleMs,
        ignoreCache,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }
}
