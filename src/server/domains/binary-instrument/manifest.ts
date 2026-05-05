import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { binaryInstrumentTools } from './definitions';
import type { BinaryInstrumentHandlers } from './handlers';

const DOMAIN = 'binary-instrument' as const;
const DEP_KEY = 'binaryInstrumentHandlers' as const;
type H = BinaryInstrumentHandlers;
const toolByName = toolLookup(binaryInstrumentTools);
const registrations = defineMethodRegistrations<H, (typeof binaryInstrumentTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: toolByName,
  entries: [
    { tool: 'binary_instrument_capabilities', method: 'handleBinaryInstrumentCapabilities' },
    { tool: 'frida_attach', method: 'handleFridaAttach' },
    { tool: 'frida_enumerate_modules', method: 'handleFridaEnumerateModules' },
    { tool: 'ghidra_analyze', method: 'handleGhidraAnalyze' },
    { tool: 'generate_hooks', method: 'handleGenerateHooks' },
    { tool: 'unidbg_emulate', method: 'handleUnidbgEmulate' },
    { tool: 'frida_run_script', method: 'handleFridaRunScript' },
    { tool: 'frida_detach', method: 'handleFridaDetach' },
    { tool: 'frida_list_sessions', method: 'handleFridaListSessions' },
    { tool: 'frida_generate_script', method: 'handleFridaGenerateScript' },
    { tool: 'get_available_plugins', method: 'handleGetAvailablePlugins' },
    { tool: 'ghidra_decompile', method: 'handleGhidraDecompile' },
    { tool: 'ida_decompile', method: 'handleIdaDecompile' },
    { tool: 'jadx_decompile', method: 'handleJadxDecompile' },
    { tool: 'unidbg_launch', method: 'handleUnidbgLaunch' },
    { tool: 'unidbg_call', method: 'handleUnidbgCall' },
    { tool: 'unidbg_trace', method: 'handleUnidbgTrace' },
    { tool: 'export_hook_script', method: 'handleExportHookScript' },
    { tool: 'frida_enumerate_functions', method: 'handleFridaEnumerateFunctions' },
    { tool: 'frida_find_symbols', method: 'handleFridaFindSymbols' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { BinaryInstrumentHandlers } = await import('./handlers');
  const { GhidraAnalyzer, HookGenerator } = await import('@modules/binary-instrument');

  let handlers = ctx.getDomainInstance<H>(DEP_KEY);
  if (!handlers) {
    handlers = new BinaryInstrumentHandlers(ctx, new GhidraAnalyzer(), new HookGenerator());
    ctx.setDomainInstance(DEP_KEY, handlers);
  }

  return handlers;
}

const manifest = {
  kind: 'domain-manifest',
  version: 1,
  domain: DOMAIN,
  depKey: DEP_KEY,
  profiles: ['full'],
  ensure,
  registrations,
  workflowRule: {
    patterns: [
      /\b(frida|ghidra|ida|unidbg|jadx|binary|disassemb|decompil|dump\s?so)\b/i,
      /(binary|native|so|dll|elf|apk).*(analyze|hook|instrument|decompile)/i,
    ],
    priority: 88,
    tools: ['frida_attach', 'ghidra_analyze', 'generate_hooks', 'unidbg_launch'],
    hint:
      'Binary analysis pipeline: attach Frida → decompile (Ghidra/IDA/JADX) → generate hook scripts → emulate' +
      'with Unidbg.',
  },
  prerequisites: {
    frida_attach: [
      {
        condition: 'plugin_frida_bridge must be installed and frida-server reachable',
        fix: 'Install @jshookmcpextension/plugin-frida-bridge; launch frida-server on the target',
      },
    ],
    frida_run_script: [
      {
        condition: 'A Frida session must be active',
        fix: 'Call frida_attach before running a script',
      },
    ],
    ghidra_analyze: [
      {
        condition: 'plugin_ghidra_bridge must be installed with Ghidra headless available',
        fix: 'Install @jshookmcpextension/plugin-ghidra-bridge and configure Ghidra path',
      },
    ],
    ida_decompile: [
      {
        condition: 'plugin_ida_bridge must be installed',
        fix: 'Install @jshookmcpextension/plugin-ida-bridge and provide IDA Pro license',
      },
    ],
    jadx_decompile: [
      {
        condition: 'plugin_jadx_bridge must be installed',
        fix: 'Install @jshookmcpextension/plugin-jadx-bridge',
      },
    ],
    unidbg_launch: [
      {
        condition: 'Java 17+ and unidbg JAR must be reachable',
        fix: 'Install JDK 17+ and download unidbg from its official release',
      },
    ],
    generate_hooks: [
      {
        condition: 'Ghidra analysis output required',
        fix: 'Run ghidra_analyze first and pass the output to generate_hooks',
      },
    ],
  },
  toolDependencies: [
    {
      from: 'process',
      to: 'binary-instrument',
      relation: 'uses',
      weight: 0.6,
    },
  ],
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
