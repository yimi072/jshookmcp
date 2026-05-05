import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { asToolResponse } from '@server/domains/shared/response';
import { pcapCarveTools } from './definitions';
import type { PcapCarveToolHandlers } from './handlers';

const DOMAIN = 'pcap-carve' as const;
const DEP_KEY = 'pcapCarveHandlers' as const;
type H = PcapCarveToolHandlers;
const t = toolLookup(pcapCarveTools);
const registrations = defineMethodRegistrations<H, (typeof pcapCarveTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  wrapResult: asToolResponse,
  entries: [
    { tool: 'pcap_stream_reassemble', method: 'handleStreamReassemble' },
    { tool: 'pcap_carve_files', method: 'handleCarveFiles' },
    { tool: 'pcap_dns_exfil', method: 'handleDnsExfil' },
    { tool: 'pcap_http_extract', method: 'handleHttpExtract' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { PcapCarveToolHandlers } = await import('./handlers');
  const existing = ctx.getDomainInstance<H>(DEP_KEY);
  if (existing) return existing;
  const handlers = new PcapCarveToolHandlers();
  ctx.setDomainInstance(DEP_KEY, handlers);
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
      /pcap\s+(carve|extract|reassemble|stream|dns|http)/i,
      /tcp\s+stream\s+reassembl/i,
      /dns\s+exfil(tration)?/i,
      /carve\s+files?\s+from\s+(pcap|capture)/i,
      /http\s+(extract|parse|capture)/i,
      /网络流量分析|pcap|抓包/i,
    ],
    priority: 0.65,
    tools: [
      'pcap_stream_reassemble',
      'pcap_carve_files',
      'pcap_dns_exfil',
      'pcap_http_extract',
      'pcap_read',
    ],
    hint:
      'Start with pcap_read for overview, then use pcap_stream_reassemble for TCP streams, ' +
      'pcap_carve_files to extract embedded files, pcap_dns_exfil for DNS exfiltration detection, ' +
      'pcap_http_extract for HTTP traffic analysis.',
  },
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
