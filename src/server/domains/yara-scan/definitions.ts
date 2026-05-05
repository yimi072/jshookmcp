import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const yaraScanTools: Tool[] = [
  tool('yara_scan', (t) =>
    t
      .desc(
        'Scan a file or hex data against YARA rules. Supports inline rule strings or rule files. ' +
          'Returns matched rules and matched strings with offsets.',
      )
      .string('filePath', 'Path to file to scan')
      .string('data', 'Hex-encoded data to scan (alternative to filePath)')
      .string('rule', 'YARA rule string (inline)')
      .string('ruleFile', 'Path to YARA rule file (.yar)')
      .required('filePath')
      .query(),
  ),

  tool('yara_list_rules', (t) =>
    t
      .desc(
        'List available built-in YARA rules. Returns rule names, descriptions, and categories. ' +
          'Includes common CTF patterns: flag detection, crypto constants, shellcode, packing.',
      )
      .enum(
        'category',
        ['all', 'flag', 'crypto', 'shellcode', 'packer', 'web', 'malware'],
        'Filter by category',
        {
          default: 'all',
        },
      )
      .query(),
  ),

  tool('yara_create_rule', (t) =>
    t
      .desc(
        'Generate a YARA rule from detected patterns. Input hex strings, ASCII patterns, or byte sequences ' +
          'and get a valid YARA rule that can be used for scanning.',
      )
      .string('name', 'Rule name')
      .array(
        'hexPatterns',
        { type: 'string', description: 'Hex pattern (e.g. "89 50 4E 47")' },
        'Hex byte patterns to match',
      )
      .array(
        'asciiPatterns',
        { type: 'string', description: 'ASCII string (e.g. "flag{")' },
        'ASCII string patterns to match',
      )
      .number('minStrings', 'Minimum strings that must match', { default: 1, minimum: 1 })
      .required('name')
      .query(),
  ),

  tool('yara_pe_indicators', (t) =>
    t
      .desc(
        'Scan PE file for suspicious indicators using pattern matching: ' +
          'anti-debug strings, crypto constants, known malware signatures, packing indicators, ' +
          'suspicious imports, and section anomalies.',
      )
      .string('filePath', 'Path to PE file (.exe, .dll)')
      .required('filePath')
      .query(),
  ),
];
