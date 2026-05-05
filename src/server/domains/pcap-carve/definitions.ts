import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const pcapCarveTools: Tool[] = [
  tool('pcap_stream_reassemble', (t) =>
    t
      .desc(
        'Reassemble TCP streams from a PCAP file. Groups packets by TCP stream (src/dst IP+port), ' +
          'reassembles payloads in sequence, and returns stream data as hex/ascii.',
      )
      .string('filePath', 'Path to PCAP file')
      .number('streamIndex', 'Specific stream index to extract (omit for all)')
      .enum('outputFormat', ['hex', 'ascii', 'raw'], 'Output format', { default: 'ascii' })
      .number('maxStreams', 'Maximum streams to return', { default: 20, minimum: 1, maximum: 200 })
      .required('filePath')
      .query(),
  ),

  tool('pcap_carve_files', (t) =>
    t
      .desc(
        'Carve files from TCP/UDP streams in a PCAP. Detects embedded file signatures (magic bytes) ' +
          'in reassembled streams and extracts them. Returns carved file info with offsets.',
      )
      .string('filePath', 'Path to PCAP file')
      .string('outputDir', 'Directory to write carved files (optional)')
      .number('minSize', 'Minimum carved file size in bytes', { default: 64, minimum: 1 })
      .required('filePath')
      .query(),
  ),

  tool('pcap_dns_exfil', (t) =>
    t
      .desc(
        'Detect DNS exfiltration patterns in PCAP. Analyzes DNS queries for unusually long subdomain labels, ' +
          'high entropy domain names, sequential patterns, and base64/hex encoded subdomains.',
      )
      .string('filePath', 'Path to PCAP file')
      .number('entropyThreshold', 'Entropy threshold for suspicious domains', {
        default: 3.5,
        minimum: 1,
        maximum: 8,
      })
      .required('filePath')
      .query(),
  ),

  tool('pcap_http_extract', (t) =>
    t
      .desc(
        'Extract HTTP request/response pairs from PCAP. Parses TCP streams for HTTP headers, ' +
          'extracts URLs, methods, status codes, and response bodies.',
      )
      .string('filePath', 'Path to PCAP file')
      .boolean('includeBody', 'Include response bodies', { default: false })
      .number('maxEntries', 'Maximum HTTP entries to return', {
        default: 50,
        minimum: 1,
        maximum: 500,
      })
      .required('filePath')
      .query(),
  ),
];
