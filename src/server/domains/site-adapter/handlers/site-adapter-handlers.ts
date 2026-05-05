import type { TMWebDriverClient } from '@modules/tmwebdriver';
import {
  getAdapterIndex,
  resolveAdapter,
  searchAdapters,
  executeAdapter,
  updateAdaptersFromGitHub,
} from '@modules/site-adapters';
import type { AdapterEntry } from '@modules/site-adapters';
import { argString } from '@server/domains/shared/parse-args';
import { R } from '@server/domains/shared/ResponseBuilder';
import type { ToolResponse } from '@server/domains/shared/ResponseBuilder';

interface SiteAdapterHandlerDeps {
  tmwdClient: TMWebDriverClient;
}

const CATEGORY_DOMAIN_MAP: Record<string, string[]> = {
  search: ['google', 'baidu', 'bing', 'duckduckgo', 'sogou'],
  social: [
    'twitter',
    'reddit',
    'weibo',
    'm_weibo',
    'xiaohongshu',
    'jike',
    'linkedin',
    'hupu',
    'linuxdo',
  ],
  news: ['bbc', 'reuters', '36kr', 'toutiao', 'eastmoney'],
  dev: [
    'github',
    'stackoverflow',
    'hackernews',
    'csdn',
    'cnblogs',
    'v2ex',
    'devto',
    'npm',
    'pypi',
    'arxiv',
  ],
  video: ['youtube', 'bilibili'],
  finance: ['xueqiu', 'eastmoney', 'yahoo-finance'],
  jobs: ['boss', 'linkedin'],
  knowledge: ['wikipedia', 'zhihu', 'openlibrary'],
};

export class SiteAdapterToolHandlers {
  constructor(private deps: SiteAdapterHandlerDeps) {}

  async handleSiteList(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const category = String(args['category'] ?? 'all');
      const index = getAdapterIndex();
      let entries = Object.entries(index) as Array<[string, AdapterEntry]>;

      if (category !== 'all') {
        const domains = CATEGORY_DOMAIN_MAP[category] ?? [];
        entries = entries.filter(([, e]) =>
          domains.some((d) => e.domain.includes(d) || e.file.startsWith(d + '/')),
        );
      }

      const list = entries.map(([name, e]) => ({
        name,
        domain: e.domain,
        description: e.description,
        readOnly: e.readOnly,
      }));

      return R.ok().build({
        count: list.length,
        category,
        adapters: list,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSiteInfo(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const name = argString(args, 'name', '');
      const index = getAdapterIndex();
      const entry = index[name];

      if (!entry) {
        return R.fail(`Adapter "${name}" not found. Use site_search to find adapters.`).build();
      }

      const adapter = resolveAdapter(name);
      return R.ok().build({
        name,
        ...entry,
        hasSource: !!adapter,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSiteRun(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const name = argString(args, 'name', '');
      const argsJson = argString(args, 'args', '{}');
      let adapterArgs: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(argsJson);
        if (parsed && typeof parsed === 'object') adapterArgs = parsed;
      } catch {
        // args is not valid JSON, use empty
      }
      const sessionId = argString(args, 'sessionId');

      const client = this.deps.tmwdClient;
      await client.start();

      const executeJsFn = async (code: string) => {
        const result = await client.executeJs(code, { sessionId: sessionId || undefined });
        return result.data ?? result.result;
      };

      const result = await executeAdapter(name, adapterArgs, executeJsFn);

      if (!result.success) {
        return R.fail(result.error ?? 'Adapter execution failed')
          .set('hint', result.hint)
          .set('adapter', result.adapter)
          .set('elapsedMs', result.elapsedMs)
          .build();
      }

      return R.ok().build({
        adapter: result.adapter,
        data: result.data,
        elapsedMs: result.elapsedMs,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSiteSearch(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const query = argString(args, 'query', '');
      const results = searchAdapters(query);

      return R.ok().build({
        query,
        count: results.length,
        results: results.map((r) => ({
          name: r.name,
          domain: r.domain,
          description: r.description,
        })),
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSiteUpdate(): Promise<ToolResponse> {
    try {
      const result = await updateAdaptersFromGitHub();
      if (!result.success) {
        return R.fail(result.error ?? 'Update failed').build();
      }
      return R.ok().build({
        message: `Updated ${result.count} adapters from epiral/bb-sites`,
        count: result.count,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }
}
