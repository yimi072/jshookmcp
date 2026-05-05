import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { asToolResponse } from '@server/domains/shared/response';
import { pwnTools } from './definitions';
import type { PwnToolHandlers } from './handlers';

const DOMAIN = 'pwn-tools' as const;
const DEP_KEY = 'pwnToolHandlers' as const;
type H = PwnToolHandlers;
const t = toolLookup(pwnTools);
const registrations = defineMethodRegistrations<H, (typeof pwnTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  wrapResult: asToolResponse,
  entries: [
    { tool: 'pwn_checksec', method: 'handleChecksec' },
    { tool: 'pwn_elf_info', method: 'handleElfInfo' },
    { tool: 'pwn_pattern_create', method: 'handlePatternCreate' },
    { tool: 'pwn_pattern_offset', method: 'handlePatternOffset' },
    { tool: 'pwn_shellcode_info', method: 'handleShellcodeInfo' },
    { tool: 'pwn_gadget_search', method: 'handleGadgetSearch' },
    { tool: 'pwn_rop_chain_build', method: 'handleRopChainBuild' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { PwnToolHandlers } = await import('./handlers');
  const existing = ctx.getDomainInstance<H>(DEP_KEY);
  if (existing) return existing;
  const handlers = new PwnToolHandlers();
  ctx.setDomainInstance(DEP_KEY, handlers);
  return handlers;
}

const manifest = {
  kind: 'domain-manifest',
  version: 1,
  domain: DOMAIN,
  depKey: DEP_KEY,
  profiles: ['full', 'workflow'],
  ensure,
  registrations,
  workflowRule: {
    patterns: [
      /pwn|exploit|buffer\s+overflow|rop|ret2|shellcode|gadget/i,
      /checksec|security\s+check|binary\s+protections/i,
      /cyclic\s+pattern|pattern\s+create|offset\s+find/i,
      /elf\s+(parse|info|header)/i,
      /rop\s+chain|gadget\s+search/i,
      /二进制利用|溢出|漏洞利用/i,
    ],
    priority: 0.65,
    tools: [
      'pwn_checksec',
      'pwn_elf_info',
      'pwn_pattern_create',
      'pwn_pattern_offset',
      'pwn_shellcode_info',
      'pwn_gadget_search',
      'pwn_rop_chain_build',
    ],
    hint:
      'Start with pwn_checksec to understand binary protections, then use pwn_elf_info for structure. ' +
      'For exploitation: pwn_pattern_create/offset for buffer overflow, pwn_gadget_search for ROP, ' +
      'pwn_shellcode_info to analyze shellcode, pwn_rop_chain_build to construct chains.',
  },
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
