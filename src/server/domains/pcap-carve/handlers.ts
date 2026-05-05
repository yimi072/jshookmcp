import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { argString, argNumber, argBool, argEnum } from '@server/domains/shared/parse-args';
import { readPcap, reassembleTcpStreams, parseDnsQueries } from './pcap-reader';

const ok = (data: unknown) => data;
const fail = (tool: string, error: unknown) => ({
  success: false,
  tool,
  error: error instanceof Error ? error.message : String(error),
});

// File magic signatures for carving
const FILE_SIGNATURES: { name: string; magic: Buffer; extension: string }[] = [
  {
    name: 'PNG',
    magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    extension: '.png',
  },
  { name: 'JPEG', magic: Buffer.from([0xff, 0xd8, 0xff]), extension: '.jpg' },
  { name: 'GIF87a', magic: Buffer.from('GIF87a'), extension: '.gif' },
  { name: 'GIF89a', magic: Buffer.from('GIF89a'), extension: '.gif' },
  { name: 'PDF', magic: Buffer.from('%PDF'), extension: '.pdf' },
  { name: 'ZIP', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]), extension: '.zip' },
  { name: 'RAR', magic: Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]), extension: '.rar' },
  { name: 'ELF', magic: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), extension: '.elf' },
  { name: 'PE', magic: Buffer.from([0x4d, 0x5a]), extension: '.exe' },
  { name: 'GZIP', magic: Buffer.from([0x1f, 0x8b]), extension: '.gz' },
  { name: 'BZ2', magic: Buffer.from('BZ'), extension: '.bz2' },
  { name: '7Z', magic: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), extension: '.7z' },
  { name: 'WEBP', magic: Buffer.from('RIFF'), extension: '.webp' },
  { name: 'MP4', magic: Buffer.from([0x00, 0x00, 0x00]), extension: '.mp4' },
];

function carveFilesFromBuffer(
  buf: Buffer,
  minSize: number,
): { name: string; extension: string; offset: number; size: number }[] {
  const carved: { name: string; extension: string; offset: number; size: number }[] = [];

  for (const sig of FILE_SIGNATURES) {
    let searchPos = 0;
    while (searchPos < buf.length) {
      const idx = buf.indexOf(sig.magic, searchPos);
      if (idx === -1) break;

      // Estimate file end (find next signature or end of buffer)
      let end = buf.length;
      for (const otherSig of FILE_SIGNATURES) {
        const nextIdx = buf.indexOf(otherSig.magic, idx + sig.magic.length);
        if (nextIdx !== -1 && nextIdx < end) {
          end = nextIdx;
        }
      }

      const size = end - idx;
      if (size >= minSize) {
        carved.push({ name: sig.name, extension: sig.extension, offset: idx, size });
      }

      searchPos = idx + 1;
    }
  }

  // Sort by offset and deduplicate overlapping
  carved.sort((a, b) => a.offset - b.offset);
  return carved;
}

export class PcapCarveToolHandlers {
  async handleStreamReassemble(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const streamIndex = argNumber(args, 'streamIndex');
      const outputFormat = argEnum(args, 'outputFormat', new Set(['hex', 'ascii', 'raw']), 'ascii');
      const maxStreams = argNumber(args, 'maxStreams', 20);

      const buf = await readFile(filePath);
      const { packets } = readPcap(buf);
      const streams = reassembleTcpStreams(packets, maxStreams);

      const results = streams
        .filter((s) => streamIndex === undefined || s.index === streamIndex)
        .map((s) => ({
          index: s.index,
          src: `${s.srcIp}:${s.srcPort}`,
          dst: `${s.dstIp}:${s.dstPort}`,
          packetCount: s.packets.length,
          payloadBytes: s.payload.length,
          preview:
            outputFormat === 'hex'
              ? s.payload.toString('hex').slice(0, 512)
              : outputFormat === 'ascii'
                ? s.payload
                    .toString('ascii')
                    .replace(/[^\x20-\x7e]/g, '.')
                    .slice(0, 512)
                : s.payload.length + ' bytes',
        }));

      return ok({
        success: true,
        filePath,
        totalPackets: packets.length,
        totalStreams: streams.length,
        streams: results,
      });
    } catch (error) {
      return fail('pcap_stream_reassemble', error);
    }
  }

  async handleCarveFiles(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const outputDir = argString(args, 'outputDir', '');
      const minSize = argNumber(args, 'minSize', 64);

      const buf = await readFile(filePath);
      const { packets } = readPcap(buf);
      const streams = reassembleTcpStreams(packets, 100);

      // Carve from all stream payloads concatenated
      const allPayload = Buffer.concat(streams.map((s) => s.payload));
      const carved = carveFilesFromBuffer(allPayload, minSize);

      // Write carved files if outputDir specified
      if (outputDir && carved.length > 0) {
        await mkdir(outputDir, { recursive: true });
        for (let i = 0; i < carved.length; i++) {
          const c = carved[i];
          if (!c) continue;
          const outPath = `${outputDir}/carved_${i}${c.extension}`;
          await writeFile(outPath, allPayload.subarray(c.offset, c.offset + c.size));
        }
      }

      return ok({
        success: true,
        filePath,
        streamCount: streams.length,
        totalPayloadBytes: allPayload.length,
        carvedCount: carved.length,
        outputDir: outputDir || null,
        files: carved.map((c) => ({
          name: c.name,
          extension: c.extension,
          offset: c.offset,
          size: c.size,
        })),
      });
    } catch (error) {
      return fail('pcap_carve_files', error);
    }
  }

  async handleDnsExfil(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const entropyThreshold = argNumber(args, 'entropyThreshold', 3.5);

      const buf = await readFile(filePath);
      const { packets } = readPcap(buf);
      const queries = parseDnsQueries(packets);

      const suspicious: {
        name: string;
        type: number;
        reason: string;
        entropy: number;
        labelLength: number;
      }[] = [];

      for (const q of queries) {
        const labels = q.name.split('.');
        const maxLabelLen = Math.max(...labels.map((l) => l.length));
        const subdomain = labels.slice(0, -2).join('.');

        // Calculate entropy of subdomain
        const freq = new Map<string, number>();
        for (const ch of subdomain) freq.set(ch, (freq.get(ch) || 0) + 1);
        let entropy = 0;
        for (const count of freq.values()) {
          const p = count / subdomain.length;
          entropy -= p * Math.log2(p);
        }

        const reasons: string[] = [];
        if (maxLabelLen > 63) reasons.push('label_too_long');
        if (subdomain.length > 50) reasons.push('long_subdomain');
        if (entropy > entropyThreshold && subdomain.length > 10) reasons.push('high_entropy');
        if (/^[0-9a-f]{32,}$/i.test(subdomain)) reasons.push('hex_encoded');
        if (/^[A-Za-z0-9+/=]{20,}$/.test(subdomain)) reasons.push('base64_like');
        if (/\d{1,3}(-\d{1,3}){5,}/.test(subdomain)) reasons.push('numeric_sequence');

        if (reasons.length > 0) {
          suspicious.push({
            name: q.name,
            type: q.type,
            reason: reasons.join(', '),
            entropy: parseFloat(entropy.toFixed(2)),
            labelLength: maxLabelLen,
          });
        }
      }

      return ok({
        success: true,
        filePath,
        totalDnsQueries: queries.length,
        suspiciousCount: suspicious.length,
        suspicious: suspicious.slice(0, 100),
        uniqueDomains: new Set(queries.map((q) => q.name.split('.').slice(-2).join('.'))).size,
      });
    } catch (error) {
      return fail('pcap_dns_exfil', error);
    }
  }

  async handleHttpExtract(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const includeBody = argBool(args, 'includeBody', false);
      const maxEntries = argNumber(args, 'maxEntries', 50);

      const buf = await readFile(filePath);
      const { packets } = readPcap(buf);
      const streams = reassembleTcpStreams(packets, 200);

      const httpEntries: {
        streamIndex: number;
        src: string;
        dst: string;
        method?: string;
        url?: string;
        statusCode?: number;
        statusText?: string;
        headers: Record<string, string>;
        bodyPreview?: string;
        bodyBytes?: number;
      }[] = [];

      for (const stream of streams) {
        if (httpEntries.length >= maxEntries) break;
        const text = stream.payload.toString('latin1');

        // Split into HTTP messages (requests and responses can be interleaved)
        const messages = text.split(/(?=^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|HTTP\/))/m);

        for (const msg of messages) {
          if (httpEntries.length >= maxEntries) break;
          const lines = msg.split('\r\n');
          if (lines.length < 2) continue;

          const firstLine = lines[0];
          if (!firstLine) continue;
          const entry: (typeof httpEntries)[number] = {
            streamIndex: stream.index,
            src: `${stream.srcIp}:${stream.srcPort}`,
            dst: `${stream.dstIp}:${stream.dstPort}`,
            headers: {},
          };

          // Parse request line
          const reqMatch = firstLine.match(
            /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\S+)\s+HTTP\//,
          );
          if (reqMatch) {
            entry.method = reqMatch[1];
            entry.url = reqMatch[2];
          }

          // Parse status line
          const statusMatch = firstLine.match(/^HTTP\/[\d.]+ (\d+) ?(.*)/);
          if (statusMatch) {
            entry.statusCode = parseInt(statusMatch[1] ?? '0');
            entry.statusText = statusMatch[2] ?? '';
          }

          // Parse headers
          let bodyStart = -1;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined) continue;
            if (line === '') {
              bodyStart = i + 1;
              break;
            }
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              const key = line.slice(0, colonIdx).trim().toLowerCase();
              const value = line.slice(colonIdx + 1).trim();
              entry.headers[key] = value;
            }
          }

          // Body
          if (bodyStart >= 0 && bodyStart < lines.length) {
            const body = lines.slice(bodyStart).join('\r\n');
            entry.bodyBytes = body.length;
            if (includeBody) {
              entry.bodyPreview = body.slice(0, 1024);
            }
          }

          if (entry.method || entry.statusCode) {
            httpEntries.push(entry);
          }
        }
      }

      return ok({
        success: true,
        filePath,
        totalPackets: packets.length,
        totalStreams: streams.length,
        httpCount: httpEntries.length,
        entries: httpEntries,
      });
    } catch (error) {
      return fail('pcap_http_extract', error);
    }
  }
}
