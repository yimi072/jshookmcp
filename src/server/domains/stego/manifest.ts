import type { DomainManifest, MCPServerContext } from '@server/domains/shared/registry';
import { defineMethodRegistrations, toolLookup } from '@server/domains/shared/registry';
import { asToolResponse } from '@server/domains/shared/response';
import { stegoTools } from './definitions';
import type { StegoToolHandlers } from './handlers';

const DOMAIN = 'stego' as const;
const DEP_KEY = 'stegoHandlers' as const;
type H = StegoToolHandlers;
const t = toolLookup(stegoTools);
const registrations = defineMethodRegistrations<H, (typeof stegoTools)[number]['name']>({
  domain: DOMAIN,
  depKey: DEP_KEY,
  lookup: t,
  wrapResult: asToolResponse,
  entries: [
    { tool: 'stego_scan_file', method: 'handleScanFile' },
    { tool: 'stego_lsb_extract', method: 'handleLsbExtract' },
    { tool: 'stego_png_chunks', method: 'handlePngChunks' },
    { tool: 'stego_exif_extract', method: 'handleExifExtract' },
    { tool: 'stego_border_decode', method: 'handleBorderDecode' },
    { tool: 'stego_xor_brute', method: 'handleXorBrute' },
  ],
});

async function ensure(ctx: MCPServerContext): Promise<H> {
  const { StegoToolHandlers } = await import('./handlers');
  const existing = ctx.getDomainInstance<H>(DEP_KEY);
  if (existing) return existing;
  const handlers = new StegoToolHandlers();
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
      /steg(anography|o|hide|solve|seek)/i,
      /hidden\s+(data|message|flag|text)/i,
      /lsb|least\s+significant/i,
      /png\s+chunk|ihdr|idat|iend/i,
      /exif|metadata|comment/i,
      /border\s+steg|pixel\s+border/i,
      /xor\s+(brute|decode|crack)/i,
      /隐写|lsb|最低位/i,
    ],
    priority: 0.7,
    tools: [
      'stego_scan_file',
      'stego_lsb_extract',
      'stego_png_chunks',
      'stego_exif_extract',
      'stego_border_decode',
      'stego_xor_brute',
    ],
    hint:
      'Start with stego_scan_file to detect indicators, then use specialized tools: ' +
      'stego_lsb_extract for LSB, stego_png_chunks for PNG structure, stego_exif_extract for metadata, ' +
      'stego_border_decode for border encoding, stego_xor_brute for XOR-encoded data.',
  },
} satisfies DomainManifest<typeof DEP_KEY, H, typeof DOMAIN>;

export default manifest;
