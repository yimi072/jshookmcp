#!/usr/bin/env node

/**
 * jshook CLI — Agent-friendly command-line interface.
 *
 * Output contract:
 *   - stdout: JSON or JSONL (machine-parseable)
 *   - stderr: human-readable logs / progress
 *   - Errors: structured JSON with { ok: false, code, message, context }
 *
 * Usage:
 *   jshook eval "document.title"
 *   jshook snapshot [--max-depth 15]
 *   jshook site list [--filter keyword]
 *   jshook stego scan <file>
 *   jshook pcap streams <file>
 *   jshook yara scan <file> [--rule-file rules.yar]
 *   jshook pwn checksec <binary>
 */

import { TMWebDriverClient, ExtensionManager } from '@modules/tmwebdriver';
import { RealBrowserToolHandlers } from '@server/domains/real-browser/handlers/real-browser-handlers';
import {
  getAdapterIndex,
  searchAdapters,
  executeAdapter,
  resolveAdapter,
  updateAdaptersFromGitHub,
} from '@modules/site-adapters/adapter-runtime';
import { runEnvironmentDoctor } from '@utils/environmentDoctor';
import { StegoToolHandlers } from '@server/domains/stego/handlers';
import { PcapCarveToolHandlers } from '@server/domains/pcap-carve/handlers';
import { YaraScanToolHandlers } from '@server/domains/yara-scan/handlers';
import { PwnToolHandlers } from '@server/domains/pwn-tools/handlers';

// ── Structured Output Helpers ──────────────────────────────────────

interface CliError {
  ok: false;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

interface CliSuccess<T = unknown> {
  ok: true;
  data: T;
  meta?: { elapsedMs?: number; command?: string };
}

function success<T>(data: T, meta?: CliSuccess<T>['meta']): void {
  const payload: CliSuccess<T> = { ok: true, data, meta };
  console.log(JSON.stringify(payload));
}

function error(code: string, message: string, context?: Record<string, unknown>): never {
  const payload: CliError = { ok: false, code, message, context };
  console.log(JSON.stringify(payload));
  process.exit(1);
}

function log(msg: string): void {
  console.error(`[jshook] ${msg}`);
}

// ── Argument Parsing ───────────────────────────────────────────────

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function stripFlags(args: string[], flags: string[]): string[] {
  const result: string[] = [];
  let skip = false;
  for (const a of args) {
    if (skip) {
      skip = false;
      continue;
    }
    if (flags.includes(a)) {
      skip = true;
      continue;
    }
    result.push(a);
  }
  return result;
}

// ── Usage ──────────────────────────────────────────────────────────

function usage(): never {
  console.error(`
jshook — Agent-friendly CLI for browser automation & security analysis

COMMANDS:
  Browser Automation:
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

  Site Adapters:
    site list [--filter keyword]          List available site adapters
    site info <name>                      Show adapter details
    site run <name> [--args '{}']         Run a site adapter
    site search <query>                   Search adapters by keyword
    site update                           Update adapters from GitHub

  Steganography:
    stego scan <file>                     Scan file for stego indicators
    stego lsb <file> [--bit-plane 0] [--channel rgb]
    stego png <file>                      Parse PNG chunks
    stego exif <file>                     Extract EXIF/metadata
    stego border <file> [--threshold 384]
    stego xor <hex|file> [--top-n 10]     Brute-force single-byte XOR

  PCAP Analysis:
    pcap streams <file> [--max-streams 20]
    pcap carve <file> [--output-dir dir]  Carve files from PCAP
    pcap dns <file>                       Detect DNS exfiltration
    pcap http <file> [--include-body]     Extract HTTP traffic

  YARA Scan:
    yara scan <file> [--rule-file file]   Scan with YARA rules
    yara rules [--category all]           List built-in rules
    yara create-rule <name> [--hex "89 50"] [--ascii "flag{"]

  Pwn Tools:
    pwn checksec <binary>                 Check binary protections
    pwn elf <binary>                      Parse ELF header info
    pwn pattern create [--length 256]     Generate cyclic pattern
    pwn pattern offset <value>            Find offset in pattern
    pwn shellcode <hex|file>              Analyze shellcode
    pwn gadgets <binary> [--pattern "pop rdi"]
    pwn rop <binary> [--action exec_shell]

  Utility:
    doctor                                Check environment health

OPTIONS:
  --json          Force JSON output (default: always JSON)
  --session <id>  Target specific session/tab
  --help, -h      Show this help

ENVIRONMENT:
  JSHOOK_TMWD_HOST      TMWebDriver host (default: 127.0.0.1)
  JSHOOK_TMWD_PORT      TMWebDriver WS port (default: 18765)
  JSHOOK_TMWD_REMOTE    Remote URL (e.g. http://host:18766/link)
`);
  process.exit(0);
}

// ── Browser Connection ─────────────────────────────────────────────

async function connectBrowser(): Promise<{
  client: TMWebDriverClient;
  handlers: RealBrowserToolHandlers;
}> {
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

// ── Domain Handler Factories ───────────────────────────────────────

const stegoHandlers = new StegoToolHandlers();
const pcapHandlers = new PcapCarveToolHandlers();
const yaraHandlers = new YaraScanToolHandlers();
const pwnHandlers = new PwnToolHandlers();

// ── Command Dispatch ───────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0 || hasFlag(rawArgs, '--help') || hasFlag(rawArgs, '-h')) {
    usage();
  }

  const sessionFlag = getArg(rawArgs, '--session');
  const cmdArgs = stripFlags(rawArgs, ['--session', '--help', '-h']);
  const command = cmdArgs[0];
  const sub = cmdArgs[1];

  log(`command: ${command}${sub ? ' ' + sub : ''}`);

  try {
    // ── Doctor (no connection needed) ──
    if (command === 'doctor') {
      const report = await runEnvironmentDoctor({ includeBridgeHealth: true });
      success(report, { command: 'doctor' });
      process.exit(0);
    }

    // ── Site Adapters (no browser connection needed) ──
    if (command === 'site') {
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
        success({ count: entries.length, adapters: entries }, { command: 'site list' });
        process.exit(0);
      }

      if (sub === 'search') {
        const query = cmdArgs[2];
        if (!query) error('E_USAGE', 'Usage: jshook site search <query>');
        const results = searchAdapters(query);
        success({ count: results.length, results }, { command: 'site search' });
        process.exit(0);
      }

      if (sub === 'info') {
        const name = cmdArgs[2];
        if (!name) error('E_USAGE', 'Usage: jshook site info <name>');
        const adapter = resolveAdapter(name);
        if (!adapter) error('E_NOT_FOUND', `Adapter "${name}" not found`, { name });
        success(
          { name: adapter.meta.name, meta: adapter.meta, source: adapter.source },
          { command: 'site info' },
        );
        process.exit(0);
      }

      if (sub === 'run') {
        const name = cmdArgs[2];
        if (!name) error('E_USAGE', 'Usage: jshook site run <name> [--args \'{"key":"val"}\']');
        const argsJson = getArg(rawArgs, '--args') || '{}';
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsJson);
        } catch {
          error('E_INVALID_JSON', 'Invalid --args JSON');
        }

        const { client } = await connectBrowser();
        const result = await executeAdapter(name, args, async (code) => {
          const r = await client.executeJs(code, { sessionId: sessionFlag || undefined });
          return r.data ?? r.result;
        });
        success(result, { command: 'site run' });
        process.exit(0);
      }

      if (sub === 'update') {
        log('Updating adapters from epiral/bb-sites...');
        const result = await updateAdaptersFromGitHub();
        if (result.success) {
          success(
            { message: `Updated ${result.count} adapters`, count: result.count },
            { command: 'site update' },
          );
        } else {
          error('E_UPDATE_FAILED', result.error || 'Update failed', { source: 'epiral/bb-sites' });
        }
        process.exit(0);
      }

      error(
        'E_UNKNOWN_SUBCOMMAND',
        `Unknown site subcommand: ${sub}. Use: list, info, run, search, update`,
      );
    }

    // ── Steganography (no connection needed) ──
    if (command === 'stego') {
      const filePath = cmdArgs[2];
      if (!filePath) error('E_USAGE', `Usage: jshook stego ${sub} <file>`);

      if (sub === 'scan') {
        const result = await stegoHandlers.handleScanFile({ filePath });
        success(result, { command: 'stego scan' });
        process.exit(0);
      }

      if (sub === 'lsb') {
        const bitPlane = getArg(rawArgs, '--bit-plane') || '0';
        const channel = getArg(rawArgs, '--channel') || 'rgb';
        const result = await stegoHandlers.handleLsbExtract({
          filePath,
          bitPlane,
          channel,
          maxBytes: 4096,
        });
        success(result, { command: 'stego lsb' });
        process.exit(0);
      }

      if (sub === 'png') {
        const result = await stegoHandlers.handlePngChunks({ filePath });
        success(result, { command: 'stego png' });
        process.exit(0);
      }

      if (sub === 'exif') {
        const result = await stegoHandlers.handleExifExtract({ filePath });
        success(result, { command: 'stego exif' });
        process.exit(0);
      }

      if (sub === 'border') {
        const threshold = parseInt(getArg(rawArgs, '--threshold') || '384', 10);
        const result = await stegoHandlers.handleBorderDecode({ filePath, threshold });
        success(result, { command: 'stego border' });
        process.exit(0);
      }

      if (sub === 'xor') {
        const topN = parseInt(getArg(rawArgs, '--top-n') || '10', 10);
        let data: string | undefined;
        // Check if filePath is actually hex data
        if (/^[0-9a-fA-F]+$/.test(filePath) && filePath.length >= 4) {
          data = filePath;
        }
        const result = await stegoHandlers.handleXorBrute({
          ...(data ? { data } : { filePath }),
          topN,
        });
        success(result, { command: 'stego xor' });
        process.exit(0);
      }

      error(
        'E_UNKNOWN_SUBCOMMAND',
        `Unknown stego subcommand: ${sub}. Use: scan, lsb, png, exif, border, xor`,
      );
    }

    // ── PCAP Carve (no connection needed) ──
    if (command === 'pcap') {
      const filePath = cmdArgs[2];
      if (!filePath) error('E_USAGE', `Usage: jshook pcap ${sub} <file>`);

      if (sub === 'streams') {
        const maxStreams = parseInt(getArg(rawArgs, '--max-streams') || '20', 10);
        const result = await pcapHandlers.handleStreamReassemble({ filePath, maxStreams });
        success(result, { command: 'pcap streams' });
        process.exit(0);
      }

      if (sub === 'carve') {
        const outputDir = getArg(rawArgs, '--output-dir') || '';
        const result = await pcapHandlers.handleCarveFiles({ filePath, outputDir });
        success(result, { command: 'pcap carve' });
        process.exit(0);
      }

      if (sub === 'dns') {
        const result = await pcapHandlers.handleDnsExfil({ filePath });
        success(result, { command: 'pcap dns' });
        process.exit(0);
      }

      if (sub === 'http') {
        const includeBody = hasFlag(rawArgs, '--include-body');
        const result = await pcapHandlers.handleHttpExtract({ filePath, includeBody });
        success(result, { command: 'pcap http' });
        process.exit(0);
      }

      error(
        'E_UNKNOWN_SUBCOMMAND',
        `Unknown pcap subcommand: ${sub}. Use: streams, carve, dns, http`,
      );
    }

    // ── YARA Scan (no connection needed) ──
    if (command === 'yara') {
      if (sub === 'rules') {
        const category = getArg(rawArgs, '--category') || 'all';
        const result = await yaraHandlers.handleListRules({ category });
        success(result, { command: 'yara rules' });
        process.exit(0);
      }

      if (sub === 'scan') {
        const filePath = cmdArgs[2];
        if (!filePath) error('E_USAGE', 'Usage: jshook yara scan <file> [--rule-file rules.yar]');
        const ruleFile = getArg(rawArgs, '--rule-file') || '';
        const result = await yaraHandlers.handleScan({
          filePath,
          ...(ruleFile ? { ruleFile } : {}),
        });
        success(result, { command: 'yara scan' });
        process.exit(0);
      }

      if (sub === 'create-rule') {
        const name = cmdArgs[2];
        if (!name)
          error(
            'E_USAGE',
            'Usage: jshook yara create-rule <name> [--hex "89 50"] [--ascii "flag{"]',
          );
        const hexPatterns: string[] = [];
        const asciiPatterns: string[] = [];
        // Parse repeated --hex and --ascii flags
        for (let i = 0; i < rawArgs.length; i++) {
          if (rawArgs[i] === '--hex' && rawArgs[i + 1]) hexPatterns.push(rawArgs[i + 1]);
          if (rawArgs[i] === '--ascii' && rawArgs[i + 1]) asciiPatterns.push(rawArgs[i + 1]);
        }
        const result = await yaraHandlers.handleCreateRule({ name, hexPatterns, asciiPatterns });
        success(result, { command: 'yara create-rule' });
        process.exit(0);
      }

      error(
        'E_UNKNOWN_SUBCOMMAND',
        `Unknown yara subcommand: ${sub}. Use: scan, rules, create-rule`,
      );
    }

    // ── Pwn Tools (no connection needed) ──
    if (command === 'pwn') {
      if (sub === 'pattern') {
        const patternSub = cmdArgs[2];
        if (patternSub === 'create') {
          const length = parseInt(getArg(rawArgs, '--length') || '256', 10);
          const result = await pwnHandlers.handlePatternCreate({ length });
          success(result, { command: 'pwn pattern create' });
          process.exit(0);
        }
        if (patternSub === 'offset') {
          const value = cmdArgs[3];
          if (!value) error('E_USAGE', 'Usage: jshook pwn pattern offset <value>');
          const result = await pwnHandlers.handlePatternOffset({ value });
          success(result, { command: 'pwn pattern offset' });
          process.exit(0);
        }
        error('E_UNKNOWN_SUBCOMMAND', 'Unknown pwn pattern subcommand. Use: create, offset');
      }

      const binaryPath = cmdArgs[2];
      if (!binaryPath && sub !== 'pattern') {
        error('E_USAGE', `Usage: jshook pwn ${sub} <binary>`);
      }

      if (sub === 'checksec') {
        const result = await pwnHandlers.handleChecksec({ filePath: binaryPath });
        success(result, { command: 'pwn checksec' });
        process.exit(0);
      }

      if (sub === 'elf') {
        const result = await pwnHandlers.handleElfInfo({ filePath: binaryPath });
        success(result, { command: 'pwn elf' });
        process.exit(0);
      }

      if (sub === 'shellcode') {
        // Check if binaryPath is hex data
        if (/^[0-9a-fA-F]+$/.test(binaryPath)) {
          const result = await pwnHandlers.handleShellcodeInfo({ data: binaryPath });
          success(result, { command: 'pwn shellcode' });
        } else {
          const result = await pwnHandlers.handleShellcodeInfo({ filePath: binaryPath });
          success(result, { command: 'pwn shellcode' });
        }
        process.exit(0);
      }

      if (sub === 'gadgets') {
        const pattern = getArg(rawArgs, '--pattern') || '';
        const result = await pwnHandlers.handleGadgetSearch({ filePath: binaryPath, pattern });
        success(result, { command: 'pwn gadgets' });
        process.exit(0);
      }

      if (sub === 'rop') {
        const action = getArg(rawArgs, '--action') || 'exec_shell';
        const result = await pwnHandlers.handleRopChainBuild({ filePath: binaryPath, action });
        success(result, { command: 'pwn rop' });
        process.exit(0);
      }

      error(
        'E_UNKNOWN_SUBCOMMAND',
        `Unknown pwn subcommand: ${sub}. Use: checksec, elf, pattern, shellcode, gadgets, rop`,
      );
    }

    // ── Browser Commands (need TMWebDriver connection) ──
    const { handlers } = await connectBrowser();
    const sessionObj: Record<string, unknown> = sessionFlag ? { sessionId: sessionFlag } : {};

    switch (command) {
      case 'eval': {
        const script = cmdArgs.slice(1).join(' ');
        if (!script) error('E_USAGE', 'Usage: jshook eval <script>');
        const result = await handlers.handleExecuteJs({ script, ...sessionObj });
        success(extractData(result), { command: 'eval' });
        break;
      }

      case 'snapshot': {
        const maxDepth = getArg(rawArgs, '--max-depth');
        const args: Record<string, unknown> = { ...sessionObj };
        if (maxDepth) args.maxDepth = parseInt(maxDepth, 10);
        const result = await handlers.handleSnapshot(args);
        success(extractData(result), { command: 'snapshot' });
        break;
      }

      case 'click': {
        const refStr = cmdArgs[1];
        if (!refStr) error('E_USAGE', 'Usage: jshook click <ref_number>');
        const ref = parseInt(refStr, 10);
        if (isNaN(ref)) error('E_INVALID_ARG', 'ref must be a number');
        const result = await handlers.handleClick({ ref, ...sessionObj });
        success(extractData(result), { command: 'click' });
        break;
      }

      case 'fill': {
        const refStr = cmdArgs[1];
        if (!refStr) error('E_USAGE', 'Usage: jshook fill <ref_number> <text>');
        const ref = parseInt(refStr, 10);
        const text = cmdArgs.slice(2).join(' ');
        if (isNaN(ref) || !text)
          error('E_INVALID_ARG', 'ref must be a number and text is required');
        const result = await handlers.handleFill({ ref, text, ...sessionObj });
        success(extractData(result), { command: 'fill' });
        break;
      }

      case 'hover': {
        const refStr = cmdArgs[1];
        if (!refStr) error('E_USAGE', 'Usage: jshook hover <ref_number>');
        const ref = parseInt(refStr, 10);
        if (isNaN(ref)) error('E_INVALID_ARG', 'ref must be a number');
        const result = await handlers.handleHover({ ref, ...sessionObj });
        success(extractData(result), { command: 'hover' });
        break;
      }

      case 'open': {
        const url = cmdArgs[1];
        if (!url) error('E_USAGE', 'Usage: jshook open <url>');
        const result = await handlers.handleOpenUrl({ url, ...sessionObj });
        success(extractData(result), { command: 'open' });
        break;
      }

      case 'open-new': {
        const url = cmdArgs[1];
        if (!url) error('E_USAGE', 'Usage: jshook open-new <url>');
        const result = await handlers.handleOpenNewTab({ url });
        success(extractData(result), { command: 'open-new' });
        break;
      }

      case 'tabs': {
        const result = await handlers.handleListTabs();
        success(extractData(result), { command: 'tabs' });
        break;
      }

      case 'screenshot': {
        const savePath = getArg(rawArgs, '--path');
        const format = getArg(rawArgs, '--format') || 'png';
        const args: Record<string, unknown> = { format, ...sessionObj };
        if (savePath) args.savePath = savePath;
        const result = await handlers.handleScreenshot(args);
        success(extractData(result), { command: 'screenshot' });
        break;
      }

      case 'cookies': {
        const result = await handlers.handleCookies({ ...sessionObj });
        success(extractData(result), { command: 'cookies' });
        break;
      }

      default:
        error('E_UNKNOWN_COMMAND', `Unknown command: ${command}. Run "jshook --help" for usage.`);
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error('E_RUNTIME', message, { command, sub });
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

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  error('E_FATAL', message);
});
