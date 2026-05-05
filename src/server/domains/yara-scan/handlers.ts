import { readFile } from 'node:fs/promises';
import { argString, argNumber, argStringArray, argEnum } from '@server/domains/shared/parse-args';

const ok = (data: unknown) => data;
const fail = (tool: string, error: unknown) => ({
  success: false,
  tool,
  error: error instanceof Error ? error.message : String(error),
});

// ── Built-in YARA-like rules (pattern matching without native YARA dependency) ──

interface PatternRule {
  name: string;
  category: string;
  description: string;
  strings: { id: string; pattern: Buffer; isHex: boolean; ascii?: string }[];
  condition: { minStrings: number };
}

const BUILTIN_RULES: PatternRule[] = [
  {
    name: 'flag_format',
    category: 'flag',
    description: 'Detect common CTF flag formats',
    strings: [
      { id: 's1', pattern: Buffer.from('flag{'), isHex: false, ascii: 'flag{' },
      { id: 's2', pattern: Buffer.from('CTF{'), isHex: false, ascii: 'CTF{' },
      { id: 's3', pattern: Buffer.from('FLAG{'), isHex: false, ascii: 'FLAG{' },
      { id: 's4', pattern: Buffer.from('key{'), isHex: false, ascii: 'key{' },
      { id: 's5', pattern: Buffer.from('HTB{'), isHex: false, ascii: 'HTB{' },
      { id: 's6', pattern: Buffer.from('THM{'), isHex: false, ascii: 'THM{' },
      { id: 's7', pattern: Buffer.from('picoCTF{'), isHex: false, ascii: 'picoCTF{' },
    ],
    condition: { minStrings: 1 },
  },
  {
    name: 'crypto_constants_aes',
    category: 'crypto',
    description: 'AES S-box and round constants',
    strings: [
      { id: 's1', pattern: Buffer.from('637c777b', 'hex'), isHex: true },
      { id: 's2', pattern: Buffer.from('637C777B', 'hex'), isHex: true },
    ],
    condition: { minStrings: 1 },
  },
  {
    name: 'crypto_constants_md5',
    category: 'crypto',
    description: 'MD5 initialization constants',
    strings: [
      { id: 's1', pattern: Buffer.from('01234567', 'hex'), isHex: true },
      { id: 's2', pattern: Buffer.from('89abcdef', 'hex'), isHex: true },
      { id: 's3', pattern: Buffer.from('fedcba98', 'hex'), isHex: true },
    ],
    condition: { minStrings: 2 },
  },
  {
    name: 'crypto_constants_sha',
    category: 'crypto',
    description: 'SHA-1/SHA-256 initialization constants',
    strings: [
      { id: 's1', pattern: Buffer.from('67452301', 'hex'), isHex: true },
      { id: 's2', pattern: Buffer.from('efcdab89', 'hex'), isHex: true },
      { id: 's3', pattern: Buffer.from('98badcfe', 'hex'), isHex: true },
      { id: 's4', pattern: Buffer.from('10325476', 'hex'), isHex: true },
    ],
    condition: { minStrings: 2 },
  },
  {
    name: 'shellcode_x86',
    category: 'shellcode',
    description: 'Common x86 shellcode patterns',
    strings: [
      { id: 's1', pattern: Buffer.from([0x31, 0xc0, 0x50, 0x68]), isHex: true }, // xor eax,eax; push eax; push
      { id: 's2', pattern: Buffer.from([0xcd, 0x80]), isHex: true }, // int 0x80
      { id: 's3', pattern: Buffer.from([0x0f, 0x05]), isHex: true }, // syscall
      { id: 's4', pattern: Buffer.from('/bin/sh'), isHex: false, ascii: '/bin/sh' },
      { id: 's5', pattern: Buffer.from('/bin/bash'), isHex: false, ascii: '/bin/bash' },
    ],
    condition: { minStrings: 2 },
  },
  {
    name: 'anti_debug_strings',
    category: 'malware',
    description: 'Anti-debugging and anti-VM strings',
    strings: [
      {
        id: 's1',
        pattern: Buffer.from('IsDebuggerPresent'),
        isHex: false,
        ascii: 'IsDebuggerPresent',
      },
      {
        id: 's2',
        pattern: Buffer.from('CheckRemoteDebuggerPresent'),
        isHex: false,
        ascii: 'CheckRemoteDebuggerPresent',
      },
      {
        id: 's3',
        pattern: Buffer.from('NtQueryInformationProcess'),
        isHex: false,
        ascii: 'NtQueryInformationProcess',
      },
      { id: 's4', pattern: Buffer.from('vmware'), isHex: false, ascii: 'vmware' },
      { id: 's5', pattern: Buffer.from('VirtualBox'), isHex: false, ascii: 'VirtualBox' },
      { id: 's6', pattern: Buffer.from('sandboxie'), isHex: false, ascii: 'sandboxie' },
    ],
    condition: { minStrings: 1 },
  },
  {
    name: 'packer_indicators',
    category: 'packer',
    description: 'Common packer signatures',
    strings: [
      { id: 's1', pattern: Buffer.from('UPX!'), isHex: false, ascii: 'UPX!' },
      { id: 's2', pattern: Buffer.from('.upx'), isHex: false, ascii: '.upx' },
      { id: 's3', pattern: Buffer.from('ASPack'), isHex: false, ascii: 'ASPack' },
      { id: 's4', pattern: Buffer.from('.ndata'), isHex: false, ascii: '.ndata' },
      { id: 's5', pattern: Buffer.from('MEW'), isHex: false, ascii: 'MEW' },
    ],
    condition: { minStrings: 1 },
  },
  {
    name: 'web_shells',
    category: 'web',
    description: 'Common web shell patterns',
    strings: [
      { id: 's1', pattern: Buffer.from('eval($_'), isHex: false, ascii: 'eval($_' },
      { id: 's2', pattern: Buffer.from('system($_'), isHex: false, ascii: 'system($_' },
      { id: 's3', pattern: Buffer.from('exec($_'), isHex: false, ascii: 'exec($_' },
      { id: 's4', pattern: Buffer.from('passthru'), isHex: false, ascii: 'passthru' },
      { id: 's5', pattern: Buffer.from('shell_exec'), isHex: false, ascii: 'shell_exec' },
    ],
    condition: { minStrings: 1 },
  },
];

function scanWithRule(
  buf: Buffer,
  rule: PatternRule,
): { matched: boolean; matches: { id: string; offset: number; ascii?: string }[] } {
  const matches: { id: string; offset: number; ascii?: string }[] = [];

  for (const s of rule.strings) {
    const idx = buf.indexOf(s.pattern);
    if (idx !== -1) {
      matches.push({ id: s.id, offset: idx, ascii: s.ascii });
    }
  }

  return { matched: matches.length >= rule.condition.minStrings, matches };
}

function parseInlineRule(ruleStr: string): PatternRule | null {
  // Parse a simplified YARA-like rule string
  const nameMatch = ruleStr.match(/rule\s+(\w+)/);
  if (!nameMatch) return null;

  const strings: PatternRule['strings'] = [];
  const stringMatches = ruleStr.matchAll(/\$(\w+)\s*=\s*(?:"([^"]+)"|([0-9a-fA-F\s]+))/g);
  for (const m of stringMatches) {
    const id = m[1];
    if (!id) continue;
    if (m[2] !== undefined) {
      strings.push({ id, pattern: Buffer.from(m[2]), isHex: false, ascii: m[2] });
    } else if (m[3] !== undefined) {
      const hex = m[3].replace(/\s+/g, '');
      strings.push({ id, pattern: Buffer.from(hex, 'hex'), isHex: true });
    }
  }

  const condMatch = ruleStr.match(/condition\s*:\s*(\d+)\s+of/);
  const minStrings = condMatch && condMatch[1] ? parseInt(condMatch[1]) : 1;

  return {
    name: nameMatch[1] ?? 'unnamed',
    category: 'custom',
    description: 'User-defined rule',
    strings,
    condition: { minStrings },
  };
}

export class YaraScanToolHandlers {
  async handleScan(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      const dataHex = argString(args, 'data', '');
      const ruleStr = argString(args, 'rule', '');
      const ruleFile = argString(args, 'ruleFile', '');

      let buf: Buffer;
      if (filePath) {
        buf = await readFile(filePath);
      } else if (dataHex) {
        buf = Buffer.from(dataHex, 'hex');
      } else {
        throw new Error('Either filePath or data is required');
      }

      // Determine rules to use
      const rules: PatternRule[] = [];
      if (ruleStr) {
        const parsed = parseInlineRule(ruleStr);
        if (parsed) rules.push(parsed);
        else throw new Error('Failed to parse inline YARA rule');
      } else if (ruleFile) {
        const ruleContent = await readFile(ruleFile, 'utf8');
        // Parse multiple rules from file
        const ruleBlocks = ruleContent.split(/(?=rule\s+\w+)/);
        for (const block of ruleBlocks) {
          const parsed = parseInlineRule(block.trim());
          if (parsed) rules.push(parsed);
        }
      } else {
        rules.push(...BUILTIN_RULES);
      }

      const findings: {
        ruleName: string;
        category: string;
        description: string;
        matched: boolean;
        matchCount: number;
        matches: { id: string; offset: number; ascii?: string }[];
      }[] = [];

      for (const rule of rules) {
        const result = scanWithRule(buf, rule);
        if (result.matched) {
          findings.push({
            ruleName: rule.name,
            category: rule.category,
            description: rule.description,
            matched: true,
            matchCount: result.matches.length,
            matches: result.matches,
          });
        }
      }

      return ok({
        success: true,
        filePath: filePath || null,
        dataBytes: buf.length,
        rulesChecked: rules.length,
        matchesFound: findings.length,
        findings,
      });
    } catch (error) {
      return fail('yara_scan', error);
    }
  }

  async handleListRules(args: Record<string, unknown>) {
    try {
      const category = argEnum(
        args,
        'category',
        new Set(['all', 'flag', 'crypto', 'shellcode', 'packer', 'web', 'malware']),
        'all',
      );

      const filtered =
        category === 'all' ? BUILTIN_RULES : BUILTIN_RULES.filter((r) => r.category === category);

      return ok({
        success: true,
        totalRules: BUILTIN_RULES.length,
        filteredCount: filtered.length,
        category,
        rules: filtered.map((r) => ({
          name: r.name,
          category: r.category,
          description: r.description,
          stringCount: r.strings.length,
          minMatch: r.condition.minStrings,
        })),
      });
    } catch (error) {
      return fail('yara_list_rules', error);
    }
  }

  async handleCreateRule(args: Record<string, unknown>) {
    try {
      const name = argString(args, 'name', '');
      if (!name) throw new Error('name is required');
      const hexPatterns = argStringArray(args, 'hexPatterns');
      const asciiPatterns = argStringArray(args, 'asciiPatterns');
      const minStrings = argNumber(args, 'minStrings', 1);

      if (hexPatterns.length === 0 && asciiPatterns.length === 0) {
        throw new Error('At least one hexPatterns or asciiPatterns is required');
      }

      const stringDefs: string[] = [];
      let idx = 0;

      for (const hex of hexPatterns) {
        stringDefs.push(`  $hex${idx} = { ${hex} }`);
        idx++;
      }
      for (const ascii of asciiPatterns) {
        stringDefs.push(`  $str${idx} = "${ascii}"`);
        idx++;
      }

      const rule = `rule ${name} {
  strings:
${stringDefs.join('\n')}
  condition:
    ${minStrings} of them
}`;

      return ok({
        success: true,
        name,
        patternCount: hexPatterns.length + asciiPatterns.length,
        minStrings,
        rule,
      });
    } catch (error) {
      return fail('yara_create_rule', error);
    }
  }

  async handlePeIndicators(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      if (buf[0] !== 0x4d || buf[1] !== 0x5a) {
        throw new Error('Not a PE file (missing MZ header)');
      }

      const indicators: { category: string; finding: string; severity: string }[] = [];
      const ascii = buf.toString('ascii');

      // Anti-debug strings
      const antiDebug = [
        'IsDebuggerPresent',
        'CheckRemoteDebuggerPresent',
        'NtQueryInformationProcess',
        'OutputDebugString',
        'FindWindow',
        'OllyDbg',
        'x64dbg',
        'IDA Pro',
      ];
      for (const s of antiDebug) {
        if (ascii.includes(s)) {
          indicators.push({ category: 'anti-debug', finding: `String: ${s}`, severity: 'medium' });
        }
      }

      // Crypto constants
      if (buf.includes(Buffer.from('637c777b', 'hex'))) {
        indicators.push({ category: 'crypto', finding: 'AES S-box detected', severity: 'info' });
      }

      // Suspicious imports
      const suspiciousDlls = [
        'ws2_32.dll',
        'wininet.dll',
        'urlmon.dll',
        'crypt32.dll',
        'advapi32.dll',
        'shell32.dll',
      ];
      for (const dll of suspiciousDlls) {
        if (ascii.toLowerCase().includes(dll.toLowerCase())) {
          indicators.push({
            category: 'import',
            finding: `Suspicious DLL: ${dll}`,
            severity: 'low',
          });
        }
      }

      // Packer indicators
      const packers = ['UPX!', 'ASPack', '.ndata', 'MEW', 'PEC2', '.themida'];
      for (const p of packers) {
        if (ascii.includes(p)) {
          indicators.push({
            category: 'packer',
            finding: `Packer signature: ${p}`,
            severity: 'medium',
          });
        }
      }

      // Section anomalies
      const peOffset = buf.readUInt32LE(0x3c);
      if (peOffset + 6 <= buf.length) {
        const numSections = buf.readUInt16LE(peOffset + 6);
        const optHeaderSize = buf.readUInt16LE(peOffset + 20);
        const sectionStart = peOffset + 24 + optHeaderSize;

        for (let i = 0; i < numSections; i++) {
          const secOff = sectionStart + i * 40;
          if (secOff + 40 > buf.length) break;
          const secName = buf.toString('ascii', secOff, secOff + 8).replace(/\\x00/g, '');
          const virtualSize = buf.readUInt32LE(secOff + 8);
          const rawSize = buf.readUInt32LE(secOff + 16);
          const characteristics = buf.readUInt32LE(secOff + 36);

          if (characteristics & 0x20000000) {
            indicators.push({
              category: 'section',
              finding: `Executable section: ${secName}`,
              severity: 'info',
            });
          }
          if (rawSize === 0 && virtualSize > 0) {
            indicators.push({
              category: 'section',
              finding: `Section ${secName}: zero raw size, non-zero virtual (possible unpacking stub)`,
              severity: 'medium',
            });
          }
          if (secName === '.upx' || secName === 'UPX') {
            indicators.push({
              category: 'packer',
              finding: `UPX section detected: ${secName}`,
              severity: 'high',
            });
          }
        }
      }

      // Network indicators
      const ipPattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g;
      const ips = ascii.match(ipPattern) ?? [];
      const validIps = ips.filter((ip) => {
        const parts = ip.split('.');
        return parts.every((p) => parseInt(p) >= 0 && parseInt(p) <= 255);
      });
      if (validIps.length > 0) {
        indicators.push({
          category: 'network',
          finding: `Embedded IPs: ${[...new Set(validIps)].slice(0, 5).join(', ')}`,
          severity: 'info',
        });
      }

      const urlPattern = /https?:\/\/[\w.-]+/gi;
      const urls = ascii.match(urlPattern) ?? [];
      if (urls.length > 0) {
        indicators.push({
          category: 'network',
          finding: `Embedded URLs: ${[...new Set(urls)].slice(0, 5).join(', ')}`,
          severity: 'info',
        });
      }

      return ok({
        success: true,
        filePath,
        fileSize: buf.length,
        indicatorCount: indicators.length,
        indicators,
        summary: {
          antiDebug: indicators.filter((i) => i.category === 'anti-debug').length,
          crypto: indicators.filter((i) => i.category === 'crypto').length,
          suspicious: indicators.filter((i) => i.severity === 'high' || i.severity === 'medium')
            .length,
        },
      });
    } catch (error) {
      return fail('yara_pe_indicators', error);
    }
  }
}
