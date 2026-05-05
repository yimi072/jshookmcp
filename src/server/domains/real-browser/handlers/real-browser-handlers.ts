import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TMWebDriverClient, ExtensionManager } from '@modules/tmwebdriver';
import { FULL_SCAN_JS, TEXT_ONLY_JS, processScanResult, cleanTextOutput } from '@modules/dom-intel';
import {
  SNAPSHOT_JS,
  parseSnapshot,
  refRegistry,
  clickRefJs,
  fillRefJs,
  hoverRefJs,
} from '@modules/a11y-snapshot';
import { argString, argNumber, argBool } from '@server/domains/shared/parse-args';
import { R } from '@server/domains/shared/ResponseBuilder';
import type { ToolResponse } from '@server/domains/shared/ResponseBuilder';

export class RealBrowserToolHandlers {
  private client: TMWebDriverClient;
  private extManager: ExtensionManager;

  constructor(client: TMWebDriverClient, extManager: ExtensionManager) {
    this.client = client;
    this.extManager = extManager;
  }

  async handleSetupStatus(): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessions = await this.client.getSessions();
      const extPath = this.extManager.getExtensionPath();
      return R.ok().build({
        extensionName: 'TMWD CDP Bridge',
        extensionPath: extPath,
        tmwebdriverHost: this.client.host,
        tmwebdriverWsPort: this.client.port,
        tmwebdriverHttpPort: this.client.port + 1,
        remoteMode: this.client.isRemote,
        connectedTabs: sessions.length,
        defaultSessionId: this.client.defaultSessionId,
        tabs: sessions,
        notes: [
          'Load the unpacked extension from extensionPath in chrome://extensions with Developer Mode enabled.',
          'Keep a normal http/https page open in Chrome; about:blank is not enough.',
          'This MCP server hosts TMWebDriver itself unless another compatible bridge is already listening.',
        ],
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleListTabs(): Promise<ToolResponse> {
    try {
      await this.client.start();
      return R.ok().build({
        defaultSessionId: this.client.defaultSessionId,
        tabs: await this.client.getSessions(),
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSwitchTab(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessionId = argString(args, 'sessionId');
      const urlPattern = argString(args, 'urlPattern');

      if (sessionId) {
        const found = this.client.setSession(sessionId);
        if (!found) return R.fail(`Session ${sessionId} not found`).build();
      } else if (urlPattern) {
        const found = this.client.setSession(urlPattern);
        if (!found) return R.fail(`No session matching URL pattern: ${urlPattern}`).build();
      }

      return R.ok().build({
        activeSessionId: this.client.defaultSessionId,
        tabs: await this.client.getSessions(),
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleOpenUrl(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const url = argString(args, 'url', '');
      const sessionId = argString(args, 'sessionId');
      const timeout = argNumber(args, 'timeout', 15000);

      if (sessionId) this.client.defaultSessionId = sessionId;
      await this.client.jump(url, { timeout, sessionId: sessionId || undefined });

      return R.ok().build({
        activeSessionId: this.client.defaultSessionId,
        url,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleOpenNewTab(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const url = argString(args, 'url', '');
      const result = await this.client.newTab(url);
      return R.ok().build({
        result,
        tabs: await this.client.getSessions(),
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleExtensionPath(): Promise<ToolResponse> {
    try {
      const extPath = this.extManager.getExtensionPath();
      return R.ok().build({
        extensionPath: extPath,
        manifestPath: `${extPath}/manifest.json`,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleExecuteJs(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const script = argString(args, 'script', '');
      const sessionId = argString(args, 'sessionId');
      const timeout = argNumber(args, 'timeout', 15000);

      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout,
      });

      return R.ok().build({
        tabId: this.client.defaultSessionId,
        result: result.data ?? result.result,
        newTabs: result.newTabs,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleScanPage(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessionId = argString(args, 'sessionId');
      const textOnly = argBool(args, 'textOnly', false);
      const cutlist = argBool(args, 'cutlist', true);
      const maxChars = argNumber(args, 'maxChars', 35000);
      const instruction = argString(args, 'instruction');

      // Execute the scan script in the browser
      const script = textOnly ? TEXT_ONLY_JS : FULL_SCAN_JS;
      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout: 30000,
      });

      const rawContent = String(result.data ?? result.result ?? '');

      // Process server-side
      let content: string;
      if (textOnly) {
        content = cleanTextOutput(rawContent);
      } else {
        content = processScanResult(rawContent, { cutlist, maxChars, instruction });
      }

      return R.ok().build({
        activeSessionId: this.client.defaultSessionId,
        tabs: await this.client.getSessions(),
        content,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleCdpCommand(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const method = argString(args, 'method', '');
      const paramsJson = argString(args, 'paramsJson', '{}');
      const sessionId = argString(args, 'sessionId');
      const tabId = args.tabId as number | undefined;

      const params = JSON.parse(paramsJson || '{}');
      const payload: Record<string, unknown> = { cmd: 'cdp', method, params };
      if (tabId !== undefined) payload.tabId = tabId;

      const result = await this.client.executeJs(JSON.stringify(payload), {
        sessionId: sessionId || undefined,
        timeout: 20000,
      });

      return R.ok().build((result.data ?? result.result) as Record<string, unknown>);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleCdpBatch(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const commands = args.commands;
      const sessionId = argString(args, 'sessionId');
      const tabId = args.tabId as number | undefined;

      if (!commands) return R.fail('commands is required').build();

      const payload: Record<string, unknown> = {
        cmd: 'batch',
        commands,
      };
      if (tabId !== undefined) payload.tabId = tabId;

      const result = await this.client.executeJs(JSON.stringify(payload), {
        sessionId: sessionId || undefined,
        timeout: 45000,
      });

      return R.ok().build((result.data ?? result.result) as Record<string, unknown>);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleCookies(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessionId = argString(args, 'sessionId');
      const tabId = args.tabId as number | undefined;

      const payload: Record<string, unknown> = { cmd: 'cookies' };
      if (tabId !== undefined) payload.tabId = tabId;

      const result = await this.client.executeJs(JSON.stringify(payload), {
        sessionId: sessionId || undefined,
        timeout: 15000,
      });

      return R.ok().build((result.data ?? result.result) as Record<string, unknown>);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleScreenshot(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessionId = argString(args, 'sessionId');
      const tabId = args.tabId as number | undefined;
      const format = argString(args, 'format', 'png');
      const savePath = argString(args, 'savePath');

      const payload: Record<string, unknown> = {
        cmd: 'cdp',
        method: 'Page.captureScreenshot',
        params: { format },
      };
      if (tabId !== undefined) payload.tabId = tabId;

      const result = await this.client.executeJs(JSON.stringify(payload), {
        sessionId: sessionId || undefined,
        timeout: 20000,
      });

      const data = result.data as Record<string, unknown> | undefined;
      const b64 = (data?.data as string) ?? (data as unknown as string);

      const response: Record<string, unknown> = { format, base64: b64 };

      if (savePath && typeof b64 === 'string') {
        const absPath = savePath.replace(/^~/, process.env.HOME ?? '');
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, Buffer.from(b64, 'base64'));
        response.savedTo = absPath;
      }

      return R.ok().build(response);
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleSnapshot(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const sessionId = argString(args, 'sessionId');
      const maxDepth = argNumber(args, 'maxDepth', 15);

      const script = SNAPSHOT_JS.replace(
        'buildTree(document.body, 0, 15)',
        `buildTree(document.body, 0, ${maxDepth})`,
      );
      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout: 30000,
      });

      const parsed = parseSnapshot(result.data ?? result.result);
      if (!parsed) return R.fail('Snapshot failed — page may not be loaded').build();

      // Store refs for subsequent click/fill/hover calls
      const sid = sessionId || this.client.defaultSessionId || 'default';
      refRegistry.set(sid, parsed.refs);

      return R.ok().build({
        sessionId: sid,
        tree: parsed.tree,
        refCount: Object.keys(parsed.refs).length,
        stats: parsed.stats,
      });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleClick(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const ref = args.ref as number;
      const sessionId = argString(args, 'sessionId');
      const sid = sessionId || this.client.defaultSessionId || 'default';

      const xpath = refRegistry.resolve(sid, ref);
      if (!xpath) return R.fail(`Ref #${ref} not found. Run real_browser_snapshot first.`).build();

      const script = clickRefJs(xpath);
      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout: 15000,
      });

      return R.ok().build({ ref, result: result.data ?? result.result });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleFill(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const ref = args.ref as number;
      const text = argString(args, 'text', '');
      const sessionId = argString(args, 'sessionId');
      const sid = sessionId || this.client.defaultSessionId || 'default';

      const xpath = refRegistry.resolve(sid, ref);
      if (!xpath) return R.fail(`Ref #${ref} not found. Run real_browser_snapshot first.`).build();

      const script = fillRefJs(xpath, text);
      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout: 15000,
      });

      return R.ok().build({ ref, result: result.data ?? result.result });
    } catch (e) {
      return R.fail(e).build();
    }
  }

  async handleHover(args: Record<string, unknown>): Promise<ToolResponse> {
    try {
      await this.client.start();
      const ref = args.ref as number;
      const sessionId = argString(args, 'sessionId');
      const sid = sessionId || this.client.defaultSessionId || 'default';

      const xpath = refRegistry.resolve(sid, ref);
      if (!xpath) return R.fail(`Ref #${ref} not found. Run real_browser_snapshot first.`).build();

      const script = hoverRefJs(xpath);
      const result = await this.client.executeJs(script, {
        sessionId: sessionId || undefined,
        timeout: 15000,
      });

      return R.ok().build({ ref, result: result.data ?? result.result });
    } catch (e) {
      return R.fail(e).build();
    }
  }
}
