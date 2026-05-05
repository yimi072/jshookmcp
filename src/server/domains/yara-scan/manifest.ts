import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { asToolResponse } from '@server/domains/shared/response';
import { yaraScanTools } from './definitions';
import type { YaraScanToolHandlers } from './handlers';

const DOMAIN = 'yara-scan' as const;
const DEP_KEY = 'yaraScanHandlers' as const;
type H = YaraScanToolHandlers;
const t = toolLookup(yaraScanTools);
const registrations = defineMethodRegistrations<H, (typeof yaraScanTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  wrapResult: asToolResponse,
  entries: [
    { tool: 'yara_scan', method: 'handleScan' },
    { tool: 'yara_list_rules', method: 'handleListRules' },
    { tool: 'yara_create_rule', method: 'handleCreateRule' },
    { tool: 'yara_pe_indicators', method: 'handlePeIndicators' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { YaraScanToolHandlers } = await import('./handlers');
  const existing = ctx.getDomainInstance<H>(DEP_KEY);
  if (existing) return existing;
  const handlers = new YaraScanToolHandlers();
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
      /yara\s*(scan|rule|match|create)/i,
      /malware\s+(scan|detect|signature)/i,
      /pe\s+(indicator|analysis|scan|check)/i,
      /shellcode\s+detect/i,
      /crypto\s+constant/i,
      /anti[- ]?debug\s+(detect|scan)/i,
      /packer\s+detect/i,
      /恶意软件|yara|特征扫描/i,
    ],
    priority: 0.65,
    tools: [
      'yara_scan',
      'yara_list_rules',
      'yara_create_rule',
      'yara_pe_indicators',
      'binary_entropy_analysis',
    ],
    hint:
      'Use yara_scan with built-in rules for quick scanning, yara_create_rule to generate custom rules, ' +
      'yara_pe_indicators for PE-specific analysis. Combine with binary_entropy_analysis for packing detection.',
  },
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
