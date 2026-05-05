#!/usr/bin/env node

/**
 * jshook CLI — command-line interface for browser automation.
 *
 * Usage:
 *   jshook eval "document.title"
 *   jshook snapshot [--max-depth 15]
 *   jshook click <ref>
 *   jshook fill <ref> "text"
 *   jshook hover <ref>
 *   jshook open <url>
 *   jshook tabs
 *   jshook screenshot [--path output.png]
 *   jshook cookies
 *   jshook site list [--filter keyword]
 *   jshook site info <name>
 *   jshook site run <name> [--args '{"key":"val"}']
 *   jshook site search <query>
 *   jshook doctor
 */

import { TMWebDriverClient, ExtensionManager } from '@modules/tmwebdriver';
import { RealBrowserToolHandlers } from '@server/domains/real-browser/handlers/real-browser-handlers';
import {
  getAdapterIndex,
  searchAdapters,
  executeAdapter,
  resolveAdapter,
} from '@modules/site-adapters/adapter-runtime';
import { formatEnvironmentDoctorReport, runEnvironmentDoctor } from '@utils/environmentDoctor';

// ── Helpers ────────────────────────────────────────────────────────

function usage(): never {
  console.log(`
jshook — CLI for real browser automation via MCP

COMMANDS:
  eval <script>                         Execute JavaScript in the browser
  snapshot [--max-depth N]              Get accessibility tree with @ref numbers
  click <ref>                           Click element by @ref from snapshot
  fill <ref> <text>                     Fill input by @ref
  hover <ref>                           Hover element by @ref
  open <url>                            Navigate to URL
  open-new <url>                        Open URL in new tab
  tabs                                  List connected browser tabs
  screenshot [--path file] [--format png|jpeg]
  cookies                               Get page cookies
  site list [--filter keyword]          List available site adapters
  site info <name>                      Show adapter details
  site run <name> [--args '{}']         Run a site adapter
  site search <query>                   Search adapters by keyword
  doctor                                Check environment health

OPTIONS:
  --json                                Output raw JSON
  --session <id>                        Target specific session/tab
  --help, -h                            Show this help

ENVIRONMENT:
  JSHOOK_TMWD_HOST      TMWebDriver host (default: 127.0.0.1)
  JSHOOK_TMWD_PORT      TMWebDriver WS port (default: 18765)
  JSHOOK_TMWD_REMOTE    Remote URL (e.g. http://host:18766/link)
`);
  process.exit(0);
}

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function output(data: unknown, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    prettyPrint(data);
  }
}

function extractData(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const text = result.content?.[0]?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result;
}

function prettyPrint(data: unknown, indent = 0): void {
  const pad = '  '.repeat(indent);
  if (data === null || data === undefined) {
    console.log(`${pad}(empty)`);
    return;
  }
  if (typeof data === 'string') {
    console.log(data);
    return;
  }
  if (typeof data !== 'object') {
    console.log(`${pad}${data}`);
    return;
  }
  const obj = data as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      console.log(`${pad}${key}:`);
      prettyPrint(val, indent + 1);
    } else if (Array.isArray(val)) {
      console.log(`${pad}${key}: [${val.length} items]`);
      for (const item of val.slice(0, 20)) {
        if (typeof item === 'object') {
          prettyPrint(item, indent + 1);
        } else {
          console.log(`${pad}  - ${item}`);
        }
      }
      if (val.length > 20) console.log(`${pad}  ... and ${val.length - 20} more`);
    } else {
      console.log(`${pad}${key}: ${val}`);
    }
  }
}

// ── Connection ─────────────────────────────────────────────────────

async function connect(): Promise<{ client: TMWebDriverClient; handlers: RealBrowserToolHandlers }> {
  const remoteUrl = process.env.JSHOOK_TMWD_REMOTE;
  const host = process.env.JSHOOK_TMWD_HOST || '127.0.0.1';
  const port = parseInt(process.env.JSHOOK_TMWD_PORT || '18765', 10);

  const client = remoteUrl
    ? new TMWebDriverClient({ remoteUrl })
    : new TMWebDriverClient({ host, port });

  const extManager = new ExtensionManager();
  const handlers = new RealBrowserToolHandlers(client, extManager);

  await client.start();
  return { client, handlers };
}

// ── Command Dispatch ───────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || hasFlag(rawArgs, '--help') || hasFlag(rawArgs, '-h')) {
    usage();
  }

  const jsonMode = hasFlag(rawArgs, '--json');
  const sessionFlag = getArg(rawArgs, '--session');
  const cmdArgs = rawArgs.filter(
    (a) => a !== '--json' && a !== '--help' && a !== '-h' && a !== '--session' && a !== sessionFlag,
  );

  const command = cmdArgs[0];

  // Doctor doesn't need connection
  if (command === 'doctor') {
    const report = await runEnvironmentDoctor({ includeBridgeHealth: true });
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatEnvironmentDoctorReport(report));
    }
    process.exit(0);
  }

  // Site commands that don't need browser connection
  if (command === 'site') {
    const sub = cmdArgs[1];
    if (sub === 'list') {
      const filter = getArg(rawArgs, '--filter') || '';
      const index = getAdapterIndex();
      const entries = Object.entries(index)
        .filter(
          ([name, e]) =>
            !filter ||
            name.includes(filter) ||
            e.description.toLowerCase().includes(filter.toLowerCase()) ||
            e.domain.includes(filter),
        )
        .map(([name, e]) => ({
          name,
          domain: e.domain,
          description: e.description,
          readOnly: e.readOnly,
        }));
      output({ count: entries.length, adapters: entries }, jsonMode);
      process.exit(0);
    }

    if (sub === 'search') {
      const query = cmdArgs[2];
      if (!query) die('Usage: jshook site search <query>');
      const results = searchAdapters(query);
      output({ count: results.length, results }, jsonMode);
      process.exit(0);
    }

    if (sub === 'info') {
      const name = cmdArgs[2];
      if (!name) die('Usage: jshook site info <name>');
      const adapter = resolveAdapter(name);
      if (!adapter) die(`Adapter "${name}" not found`);
      output(
        { name: adapter.meta.name, meta: adapter.meta, source: adapter.source },
        jsonMode,
      );
      process.exit(0);
    }

    if (sub === 'run') {
      const name = cmdArgs[2];
      if (!name) die('Usage: jshook site run <name> [--args \'{"key":"val"}\']');
      const argsJson = getArg(rawArgs, '--args') || '{}';
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argsJson);
      } catch {
        die('Invalid --args JSON');
      }

      const { client } = await connect();
      const result = await executeAdapter(name, args, async (code) => {
        const r = await client.executeJs(code, { sessionId: sessionFlag || undefined });
        return r.data ?? r.result;
      });
      output(result, jsonMode);
      process.exit(0);
    }

    die(`Unknown site subcommand: ${sub}. Use: list, info, run, search`);
  }

  // Browser commands — need connection
  const { handlers } = await connect();
  const sessionObj: Record<string, unknown> = sessionFlag ? { sessionId: sessionFlag } : {};

  switch (command) {
    case 'eval': {
      const script = cmdArgs.slice(1).join(' ');
      if (!script) die('Usage: jshook eval <script>');
      const result = await handlers.handleExecuteJs({ script, ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    case 'snapshot': {
      const maxDepth = getArg(rawArgs, '--max-depth');
      const args: Record<string, unknown> = { ...sessionObj };
      if (maxDepth) args.maxDepth = parseInt(maxDepth, 10);
      const result = await handlers.handleSnapshot(args);
      output(extractData(result), jsonMode);
      break;
    }

    case 'click': {
      const refStr = cmdArgs[1];
      if (!refStr) die('Usage: jshook click <ref_number>');
      const ref = parseInt(refStr, 10);
      if (isNaN(ref)) die('Usage: jshook click <ref_number>');
      const result = await handlers.handleClick({ ref, ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    case 'fill': {
      const refStr = cmdArgs[1];
      if (!refStr) die('Usage: jshook fill <ref_number> <text>');
      const ref = parseInt(refStr, 10);
      const text = cmdArgs.slice(2).join(' ');
      if (isNaN(ref) || !text) die('Usage: jshook fill <ref_number> <text>');
      const result = await handlers.handleFill({ ref, text, ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    case 'hover': {
      const refStr = cmdArgs[1];
      if (!refStr) die('Usage: jshook hover <ref_number>');
      const ref = parseInt(refStr, 10);
      if (isNaN(ref)) die('Usage: jshook hover <ref_number>');
      const result = await handlers.handleHover({ ref, ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    case 'open': {
      const url = cmdArgs[1];
      if (!url) die('Usage: jshook open <url>');
      const result = await handlers.handleOpenUrl({ url, ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    case 'open-new': {
      const url = cmdArgs[1];
      if (!url) die('Usage: jshook open-new <url>');
      const result = await handlers.handleOpenNewTab({ url });
      output(extractData(result), jsonMode);
      break;
    }

    case 'tabs': {
      const result = await handlers.handleListTabs();
      output(extractData(result), jsonMode);
      break;
    }

    case 'screenshot': {
      const savePath = getArg(rawArgs, '--path');
      const format = getArg(rawArgs, '--format') || 'png';
      const args: Record<string, unknown> = { format, ...sessionObj };
      if (savePath) args.savePath = savePath;
      const result = await handlers.handleScreenshot(args);
      output(extractData(result), jsonMode);
      break;
    }

    case 'cookies': {
      const result = await handlers.handleCookies({ ...sessionObj });
      output(extractData(result), jsonMode);
      break;
    }

    default:
      die(`Unknown command: ${command}. Run "jshook --help" for usage.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
