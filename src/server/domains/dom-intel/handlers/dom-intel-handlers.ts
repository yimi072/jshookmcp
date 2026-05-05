import type { PageController } from '@server/domains/shared/modules';
import type { DOMInspector } from '@modules/collector/DOMInspector';
import {
  FULL_SCAN_JS,
  TEXT_ONLY_JS,
  LIST_FINDER_JS,
  processScanResult,
  cleanTextOutput,
  optimizeHtmlForTokens,
  optimizeAndTruncate,
  diffPages,
} from '@modules/dom-intel';
import { argString, argNumber, argBool } from '@server/domains/shared/parse-args';
import { R } from '@server/domains/shared/ResponseBuilder';
import type { ToolResponse } from '@server/domains/shared/ResponseBuilder';

interface DomIntelHandlerDeps {
  pageController: PageController;
  domInspector: DOMInspector;
}

export class DomIntelToolHandlers {
  constructor(private deps: DomIntelHandlerDeps) {}

  async handleDomScan(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const url = argString(args, 'url');
      const textOnly = argBool(args, 'textOnly', false);
      const cutlist = argBool(args, 'cutlist', true);
      const maxChars = argNumber(args, 'maxChars', 35000);
      const instruction = argString(args, 'instruction');

      if (url) {
        await this.deps.pageController.navigate(url, { waitUntil: 'networkidle2' });
      }

      const script = textOnly ? TEXT_ONLY_JS : FULL_SCAN_JS;
      const rawResult = await this.deps.pageController.evaluate(script);
      const rawContent = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);

      let content: string;
      if (textOnly) {
        content = cleanTextOutput(rawContent);
      } else {
        content = processScanResult(rawContent, { cutlist, maxChars, instruction });
      }

      return R.ok().build({ content });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleDomFindLists(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const url = argString(args, 'url');

      if (url) {
        await this.deps.pageController.navigate(url, { waitUntil: 'networkidle2' });
      }

      const result = await this.deps.pageController.evaluate(LIST_FINDER_JS);
      const lists = typeof result === 'string' ? JSON.parse(result) : result;

      return R.ok().build({ lists });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleDomDiff(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const beforeHtml = argString(args, 'beforeHtml', '');
      const afterHtml = argString(args, 'afterHtml', '');
      const result = diffPages(beforeHtml, afterHtml);
      return R.ok().build(result as unknown as Record<string, unknown>);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleDomOptimize(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const html = argString(args, 'html', '');
      const maxChars = argNumber(args, 'maxChars', 35000);
      const result = optimizeAndTruncate(html, maxChars);
      return R.ok().build(result);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleDomExtractText(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      const html = argString(args, 'html', '');
      const optimized = optimizeHtmlForTokens(html);
      const text = cleanTextOutput(optimized);
      return R.ok().build({ text, length: text.length });
    } catch (e) {
      return R.fail(e).build();
    }
  }
}
