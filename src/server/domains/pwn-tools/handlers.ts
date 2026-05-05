import { readFile } from 'node:fs/promises';
import { argString, argNumber, argEnum } from '@server/domains/shared/parse-args';
import { parseElf } from './elf-parser';

const ok = (data: unknown) => data;
const fail = (tool: string, error: unknown) => ({
  success: false,
  tool,
  error: error instanceof Error ? error.message : String(error),
});

// ── De Bruijn sequence (cyclic pattern) ──

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function deBruijn(alphabet: string, n: number, k: number): string {
  // Generate De Bruijn sequence of order n over alphabet of size k
  const a: number[] = Array.from({ length: k * n }).fill(0) as number[];
  const sequence: number[] = [];

  function db(t: number, p: number): void {
    if (t > n) {
      if (n % p === 0) {
        for (let j = 1; j <= p; j++) {
          const val = a[j];
          if (val !== undefined) sequence.push(val);
        }
      }
    } else {
      const prev = a[t - p];
      if (prev !== undefined) a[t] = prev;
      db(t + 1, p);
      for (let j = (prev ?? 0) + 1; j < k; j++) {
        a[t] = j;
        db(t + 1, t);
      }
    }
  }

  db(1, 1);
  return sequence.map((i) => alphabet[i]).join('');
}

function generateCyclicPattern(length: number, width: number): string {
  const k = ALPHABET.length;
  const n = width;
  const seq = deBruijn(ALPHABET, n, k);
  return seq.slice(0, length);
}

function findPatternOffset(value: string, width: number): number | null {
  const pattern = generateCyclicPattern(65536, width);
  const fullPattern = Buffer.from(pattern, 'ascii');
  let searchBuf: Buffer;

  if (value.startsWith('0x')) {
    const hex = value.slice(2).replace(/\s/g, '');
    const padded = hex.length % 2 === 1 ? '0' + hex : hex;
    searchBuf = Buffer.from(padded, 'hex');
  } else {
    const num = parseInt(value, 10);
    searchBuf = Buffer.allocUnsafe(width);
    if (width === 4) {
      searchBuf.writeUInt32LE(num, 0);
    } else {
      searchBuf.writeBigUInt64LE(BigInt(num), 0);
    }
  }

  for (let i = 0; i <= fullPattern.length - searchBuf.length; i++) {
    if (fullPattern.subarray(i, i + searchBuf.length).equals(searchBuf)) {
      return i;
    }
  }

  // Fallback: search in the pattern string itself
  const searchStr = value.startsWith('0x') ? value : String.fromCharCode(...searchBuf);
  const idx = pattern.indexOf(searchStr);
  return idx >= 0 ? idx : null;
}

// ── Shellcode analysis ──

const SHELLCODE_PATTERNS = [
  {
    name: 'execve_binsh_x86',
    pattern: Buffer.from([0x31, 0xc0, 0x50, 0x68, 0x2f, 0x2f, 0x73, 0x68]),
    arch: 'x86',
  },
  {
    name: 'execve_binsh_x86_alt',
    pattern: Buffer.from([0x31, 0xc9, 0xf7, 0xe1, 0x51, 0x68, 0x2f, 0x2f]),
    arch: 'x86',
  },
  { name: 'int80_syscall', pattern: Buffer.from([0xcd, 0x80]), arch: 'x86' },
  { name: 'syscall_x64', pattern: Buffer.from([0x0f, 0x05]), arch: 'x64' },
  { name: 'sysenter', pattern: Buffer.from([0x0f, 0x34]), arch: 'x86' },
  { name: 'xor_eax_x86', pattern: Buffer.from([0x31, 0xc0]), arch: 'x86' },
  { name: 'xor_rax_x64', pattern: Buffer.from([0x48, 0x31, 0xc0]), arch: 'x64' },
  { name: 'push_pop_rdi', pattern: Buffer.from([0x5f]), arch: 'x64' },
  { name: 'binsh_string', pattern: Buffer.from('/bin/sh'), arch: 'any' },
  { name: 'bash_string', pattern: Buffer.from('/bin/bash'), arch: 'any' },
  { name: 'cmd_string', pattern: Buffer.from('cmd.exe'), arch: 'any' },
  { name: 'powershell_string', pattern: Buffer.from('powershell'), arch: 'any' },
];

function analyzeShellcode(buf: Buffer): {
  arch: string;
  patterns: { name: string; offset: number; arch: string }[];
  hasNullBytes: boolean;
  strings: string[];
  syscalls: string[];
} {
  const patterns: { name: string; offset: number; arch: string }[] = [];
  const strings: string[] = [];
  const syscalls: string[] = [];

  for (const p of SHELLCODE_PATTERNS) {
    let pos = 0;
    while (pos < buf.length) {
      const idx = buf.indexOf(p.pattern, pos);
      if (idx === -1) break;
      patterns.push({ name: p.name, offset: idx, arch: p.arch });
      pos = idx + 1;
    }
  }

  // Detect architecture
  let arch = 'unknown';
  const x64Count = patterns.filter((p) => p.arch === 'x64').length;
  const x86Count = patterns.filter((p) => p.arch === 'x86').length;
  if (x64Count > x86Count) arch = 'x86_64';
  else if (x86Count > 0) arch = 'x86';

  // Check for null bytes
  const hasNullBytes = buf.includes(0);

  // Extract strings
  const ascii = buf.toString('ascii');
  const strMatches = ascii.match(/[\x20-\x7e]{4,}/g) ?? [];
  strings.push(...strMatches.slice(0, 20));

  // Detect syscalls
  if (patterns.some((p) => p.name.includes('int80'))) syscalls.push('int 0x80 (Linux x86)');
  if (patterns.some((p) => p.name.includes('syscall_x64'))) syscalls.push('syscall (Linux x64)');
  if (patterns.some((p) => p.name.includes('sysenter'))) syscalls.push('sysenter');

  return { arch, patterns, hasNullBytes, strings, syscalls };
}

// ── Gadget search ──

const RET_OPCODES = [0xc3, 0xc2]; // ret, ret imm16
const JMP_OPCODES = [0xe9, 0xeb, 0xff]; // jmp rel32, jmp rel8, jmp r/m
const CALL_OPCODES = [0xe8, 0xff]; // call rel32, call r/m

interface Gadget {
  address: number;
  bytes: string;
  disasm: string;
}

function searchGadgets(buf: Buffer, baseAddr: number, pattern?: string, maxGadgets = 50): Gadget[] {
  const gadgets: Gadget[] = [];
  const maxLength = 20; // max bytes per gadget

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte === undefined) continue;
    if (RET_OPCODES.includes(byte) || JMP_OPCODES.includes(byte) || CALL_OPCODES.includes(byte)) {
      // Try to disassemble backwards
      for (let start = Math.max(0, i - maxLength); start <= i; start++) {
        const length = i - start + 1;
        if (length < 2 || length > maxLength) continue;

        const bytes = buf.subarray(start, i + 1);
        const disasm = simpleDisasm(bytes);

        if (pattern && !disasm.toLowerCase().includes(pattern.toLowerCase())) continue;

        gadgets.push({
          address: baseAddr + start,
          bytes: bytes.toString('hex'),
          disasm,
        });

        if (gadgets.length >= maxGadgets) return gadgets;
      }
    }
  }

  return gadgets;
}

function simpleDisasm(bytes: Buffer): string {
  // Very simplified x86/x64 disassembler for common instructions
  const ops: string[] = [];
  let i = 0;

  while (i < bytes.length) {
    const b = bytes[i];
    if (b === undefined) {
      i++;
      continue;
    }
    let op = '';

    // REX prefix
    if (b >= 0x40 && b <= 0x4f) {
      i++;
      continue;
    }

    switch (b) {
      case 0x50:
        op = 'push rax';
        break;
      case 0x51:
        op = 'push rcx';
        break;
      case 0x52:
        op = 'push rdx';
        break;
      case 0x53:
        op = 'push rbx';
        break;
      case 0x54:
        op = 'push rsp';
        break;
      case 0x55:
        op = 'push rbp';
        break;
      case 0x56:
        op = 'push rsi';
        break;
      case 0x57:
        op = 'push rdi';
        break;
      case 0x58:
        op = 'pop rax';
        break;
      case 0x59:
        op = 'pop rcx';
        break;
      case 0x5a:
        op = 'pop rdx';
        break;
      case 0x5b:
        op = 'pop rbx';
        break;
      case 0x5c:
        op = 'pop rsp';
        break;
      case 0x5d:
        op = 'pop rbp';
        break;
      case 0x5e:
        op = 'pop rsi';
        break;
      case 0x5f:
        op = 'pop rdi';
        break;
      case 0x90:
        op = 'nop';
        break;
      case 0xc3:
        op = 'ret';
        break;
      case 0xc9:
        op = 'leave';
        break;
      case 0x89:
        if (i + 1 < bytes.length) {
          const modrm = bytes[i + 1];
          if (modrm !== undefined) {
            const reg = (modrm >> 3) & 7;
            const rm = modrm & 7;
            const regNames = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'];
            op = `mov ${regNames[rm]}, ${regNames[reg]}`;
            i++;
          }
        }
        break;
      case 0x48:
        if (i + 2 < bytes.length && bytes[i + 1] === 0x89) {
          const modrm = bytes[i + 2];
          if (modrm !== undefined) {
            const reg = (modrm >> 3) & 7;
            const rm = modrm & 7;
            const regNames = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'];
            op = `mov ${regNames[rm]}, ${regNames[reg]}`;
            i += 2;
          }
        } else if (i + 2 < bytes.length && bytes[i + 1] === 0x8b) {
          const modrm = bytes[i + 2];
          if (modrm !== undefined) {
            const reg = (modrm >> 3) & 7;
            const rm = modrm & 7;
            const regNames = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'];
            op = `mov ${regNames[reg]}, ${regNames[rm]}`;
            i += 2;
          }
        } else if (i + 2 < bytes.length && bytes[i + 1] === 0x31 && bytes[i + 2] === 0xc0) {
          op = 'xor rax, rax';
          i += 2;
        }
        break;
      case 0x31:
        if (i + 1 < bytes.length && bytes[i + 1] === 0xc0) {
          op = 'xor eax, eax';
          i++;
        }
        break;
      case 0xb8:
      case 0xb9:
      case 0xba:
      case 0xbb:
      case 0xbc:
      case 0xbd:
      case 0xbe:
      case 0xbf: {
        const regNames = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi'];
        const reg = b - 0xb8;
        if (i + 4 < bytes.length) {
          const val = bytes.readUInt32LE(i + 1);
          op = `mov ${regNames[reg]}, 0x${val.toString(16)}`;
          i += 4;
        }
        break;
      }
      case 0xc7:
        if (i + 1 < bytes.length && bytes[i + 1] === 0x07) {
          if (i + 5 < bytes.length) {
            const val = bytes.readUInt32LE(i + 2);
            op = `mov dword ptr [rdi], 0x${val.toString(16)}`;
            i += 5;
          }
        }
        break;
      case 0x0f:
        if (i + 1 < bytes.length && bytes[i + 1] === 0x05) {
          op = 'syscall';
          i++;
        }
        break;
      case 0xcd:
        if (i + 1 < bytes.length && bytes[i + 1] === 0x80) {
          op = 'int 0x80';
          i++;
        }
        break;
      default:
        op = `db 0x${b.toString(16).padStart(2, '0')}`;
    }

    if (op) ops.push(op);
    i++;
  }

  return ops.join('; ');
}

export class PwnToolHandlers {
  async handleChecksec(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      const { header, programHeaders, dynamic, sectionHeaders } = parseElf(buf);

      const checks: Record<string, { enabled: boolean; detail?: string }> = {};

      // RELRO
      const relroPhdr = programHeaders.find((p) => p.type === 'GNU_RELRO');
      const bindNow = dynamic.some((d) => d.tag === 'FLAGS_1' && d.value === 0x8000000);
      if (relroPhdr && bindNow) {
        checks['RELRO'] = { enabled: true, detail: 'Full RELRO' };
      } else if (relroPhdr) {
        checks['RELRO'] = { enabled: true, detail: 'Partial RELRO' };
      } else {
        checks['RELRO'] = { enabled: false, detail: 'No RELRO' };
      }

      // Stack Canary
      const hasCanary = sectionHeaders.some(
        (s) => s.name === '__stack_chk_fail' || s.name === '__stack_chk_guard',
      );
      const hasCanarySym = buf.toString('ascii').includes('__stack_chk_fail');
      checks['Stack Canary'] = { enabled: hasCanary || hasCanarySym };

      // NX
      const stackPhdr = programHeaders.find((p) => p.type === 'GNU_STACK');
      checks['NX'] = { enabled: !stackPhdr || !stackPhdr.flags.includes('E') };

      // PIE
      checks['PIE'] = {
        enabled: header.type === 'DYN',
        detail:
          header.type === 'DYN' ? 'PIE enabled' : 'No PIE (0x' + header.entry.toString(16) + ')',
      };

      // FORTIFY
      const hasFortify = buf.toString('ascii').includes('_chk@');
      checks['FORTIFY'] = { enabled: hasFortify };

      // RPATH / RUNPATH
      const hasRpath = dynamic.some((d) => d.tag === 'RPATH');
      const hasRunpath = dynamic.some((d) => d.tag === 'RUNPATH');
      checks['RPATH'] = { enabled: hasRpath };
      checks['RUNPATH'] = { enabled: hasRunpath };

      return ok({
        success: true,
        filePath,
        arch: header.machine,
        class: header.class,
        checks,
        summary: {
          hardened: Object.values(checks).filter((c) => c.enabled).length,
          total: Object.keys(checks).length,
        },
      });
    } catch (error) {
      return fail('pwn_checksec', error);
    }
  }

  async handleElfInfo(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      const { header, programHeaders, sectionHeaders, dynamic, libraries } = parseElf(buf);

      return ok({
        success: true,
        filePath,
        header: {
          class: header.class,
          data: header.data,
          type: header.type,
          machine: header.machine,
          entry: '0x' + header.entry.toString(16),
        },
        programHeaders: programHeaders.map((p) => ({
          type: p.type,
          offset: '0x' + p.offset.toString(16),
          vaddr: '0x' + p.vaddr.toString(16),
          flags: p.flags,
          filesz: p.filesz,
          memsz: p.memsz,
        })),
        sections: sectionHeaders.slice(0, 30).map((s) => ({
          name: s.name,
          type: s.type,
          flags: s.flags,
          addr: '0x' + s.addr.toString(16),
          size: s.size,
        })),
        dynamic: dynamic.map((d) => ({ tag: d.tag, value: d.value })),
        libraries,
        sectionCount: sectionHeaders.length,
      });
    } catch (error) {
      return fail('pwn_elf_info', error);
    }
  }

  async handlePatternCreate(args: Record<string, unknown>) {
    try {
      const length = argNumber(args, 'length', 256);
      const width = argNumber(args, 'width', 4);

      const pattern = generateCyclicPattern(length, width);

      return ok({
        success: true,
        length,
        width,
        pattern,
        hex: Buffer.from(pattern).toString('hex'),
      });
    } catch (error) {
      return fail('pwn_pattern_create', error);
    }
  }

  async handlePatternOffset(args: Record<string, unknown>) {
    try {
      const value = argString(args, 'value', '');
      if (!value) throw new Error('value is required');
      const width = argNumber(args, 'width', 4);

      const offset = findPatternOffset(value, width);

      return ok({
        success: true,
        value,
        width,
        offset,
        found: offset !== null,
      });
    } catch (error) {
      return fail('pwn_pattern_offset', error);
    }
  }

  async handleShellcodeInfo(args: Record<string, unknown>) {
    try {
      const dataHex = argString(args, 'data', '');
      const filePath = argString(args, 'filePath', '');

      let buf: Buffer;
      if (dataHex) {
        buf = Buffer.from(dataHex, 'hex');
      } else if (filePath) {
        buf = await readFile(filePath);
      } else {
        throw new Error('Either data or filePath is required');
      }

      const analysis = analyzeShellcode(buf);

      return ok({
        success: true,
        inputBytes: buf.length,
        ...analysis,
        patternCount: analysis.patterns.length,
        stringCount: analysis.strings.length,
      });
    } catch (error) {
      return fail('pwn_shellcode_info', error);
    }
  }

  async handleGadgetSearch(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const pattern = argString(args, 'pattern', '');
      const maxGadgets = argNumber(args, 'maxGadgets', 50);

      const buf = await readFile(filePath);
      const { programHeaders } = parseElf(buf);

      const execSegments = programHeaders.filter((p) => p.flags.includes('E') && p.type === 'LOAD');
      const allGadgets: { address: string; bytes: string; disasm: string }[] = [];

      for (const seg of execSegments) {
        const segBuf = buf.subarray(seg.offset, seg.offset + seg.filesz);
        const gadgets = searchGadgets(
          segBuf,
          seg.vaddr,
          pattern || undefined,
          maxGadgets - allGadgets.length,
        );
        allGadgets.push(
          ...gadgets.map((g) => ({
            address: '0x' + g.address.toString(16),
            bytes: g.bytes,
            disasm: g.disasm,
          })),
        );
        if (allGadgets.length >= maxGadgets) break;
      }

      return ok({
        success: true,
        filePath,
        pattern: pattern || null,
        maxGadgets,
        segmentsSearched: execSegments.length,
        gadgetCount: allGadgets.length,
        gadgets: allGadgets,
      });
    } catch (error) {
      return fail('pwn_gadget_search', error);
    }
  }

  async handleRopChainBuild(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const action = argEnum(
        args,
        'action',
        new Set(['exec_shell', 'mmap_rwx', 'write_got', 'ret2csu']),
        'exec_shell',
      );
      const arch = argNumber(args, 'arch', 64);

      const buf = await readFile(filePath);
      const { programHeaders } = parseElf(buf);

      // Find required gadgets
      const execSegments = programHeaders.filter((p) => p.flags.includes('E') && p.type === 'LOAD');
      const gadgets: Gadget[] = [];

      for (const seg of execSegments) {
        const segBuf = buf.subarray(seg.offset, seg.offset + seg.filesz);
        const found = searchGadgets(segBuf, seg.vaddr, undefined, 200);
        gadgets.push(...found);
      }

      // Build chain based on action
      const chain: { address: string; purpose: string; bytes: string }[] = [];

      if (action === 'exec_shell') {
        // Find pop rdi; ret
        const popRdi = gadgets.find(
          (g) => g.disasm.includes('pop rdi') && g.disasm.includes('ret'),
        );
        // Find /bin/sh string
        const binshOffset = buf.indexOf('/bin/sh');

        if (popRdi && binshOffset !== -1) {
          // Find which segment contains /bin/sh
          let binshAddr = 0;
          for (const seg of programHeaders) {
            if (
              seg.type === 'LOAD' &&
              binshOffset >= seg.offset &&
              binshOffset < seg.offset + seg.filesz
            ) {
              binshAddr = seg.vaddr + (binshOffset - seg.offset);
              break;
            }
          }

          chain.push({
            address: '0x' + popRdi.address.toString(16),
            purpose: 'pop rdi; ret',
            bytes: popRdi.bytes,
          });
          chain.push({
            address: '0x' + binshAddr.toString(16),
            purpose: '"/bin/sh" address',
            bytes: 'N/A',
          });

          // Find system or execve
          const pltSection = programHeaders.find((p) => p.type === 'LOAD');
          if (pltSection) {
            // Approximate system@plt
            chain.push({
              address: '0x' + (pltSection.vaddr + 0x30).toString(16),
              purpose: 'system@plt (approximate)',
              bytes: 'N/A',
            });
          }
        }
      } else if (action === 'ret2csu') {
        // Find __libc_csu_init gadgets
        const csuInit = gadgets.find(
          (g) => g.disasm.includes('mov rdx') || g.disasm.includes('mov edi'),
        );
        if (csuInit) {
          chain.push({
            address: '0x' + csuInit.address.toString(16),
            purpose: 'csu_init gadget',
            bytes: csuInit.bytes,
          });
        }
      }

      return ok({
        success: true,
        filePath,
        action,
        arch,
        chainLength: chain.length,
        chain,
        gadgetsFound: gadgets.length,
        note:
          chain.length === 0
            ? 'Could not build chain. Binary may be missing required gadgets or symbols.'
            : 'Chain is approximate. Verify addresses with a proper disassembler.',
      });
    } catch (error) {
      return fail('pwn_rop_chain_build', error);
    }
  }
}
