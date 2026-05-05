import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const pwnTools: Tool[] = [
  tool('pwn_checksec', (t) =>
    t
      .desc(
        'Check binary security properties: RELRO, Stack Canary, NX, PIE, RPATH, RUNPATH, ' +
          'FORTIFY, Partial RELRO, SHSTK, IBT. Reads ELF headers and program headers.',
      )
      .string('filePath', 'Path to ELF binary')
      .required('filePath')
      .query(),
  ),

  tool('pwn_elf_info', (t) =>
    t
      .desc(
        'Parse ELF header and program headers: architecture, entry point, sections, ' +
          'dynamic linker, needed libraries, symbol tables, and GOT/PLT addresses.',
      )
      .string('filePath', 'Path to ELF binary')
      .required('filePath')
      .query(),
  ),

  tool('pwn_pattern_create', (t) =>
    t
      .desc(
        'Generate a De Bruijn sequence (cyclic pattern) for offset determination. ' +
          'Each 4-byte subsequence at a given offset is unique, enabling precise offset calculation.',
      )
      .number('length', 'Pattern length in bytes', { default: 256, minimum: 4, maximum: 65536 })
      .number('width', 'Character width (4 for 32-bit, 8 for 64-bit)', {
        default: 4,
        minimum: 4,
        maximum: 8,
      })
      .query(),
  ),

  tool('pwn_pattern_offset', (t) =>
    t
      .desc(
        'Find the offset of a value in a De Bruijn sequence. Input a 4-byte or 8-byte value ' +
          '(hex or decimal) that was found in a register/stack after a crash.',
      )
      .string('value', 'Value to search for (hex with 0x prefix, or decimal)')
      .number('width', 'Character width (4 or 8)', { default: 4, minimum: 4, maximum: 8 })
      .required('value')
      .query(),
  ),

  tool('pwn_shellcode_info', (t) =>
    t
      .desc(
        'Analyze shellcode: detect architecture (x86/x64/ARM), identify syscalls, ' +
          'find strings, detect null bytes, and match known shellcode patterns.',
      )
      .string('data', 'Shellcode as hex string')
      .string('filePath', 'Path to file containing shellcode')
      .query(),
  ),

  tool('pwn_gadget_search', (t) =>
    t
      .desc(
        'Search for ROP gadgets in an ELF binary. Scans executable segments for useful instruction sequences ' +
          'ending in ret/leave/jmp/call. Returns gadget addresses and disassembly.',
      )
      .string('filePath', 'Path to ELF binary')
      .string('pattern', 'Gadget pattern to search (e.g. "pop rdi; ret", "mov rax, rdi")')
      .number('maxGadgets', 'Maximum gadgets to return', { default: 50, minimum: 1, maximum: 500 })
      .required('filePath')
      .query(),
  ),

  tool('pwn_rop_chain_build', (t) =>
    t
      .desc(
        'Build a basic ROP chain from available gadgets. Given a target action (e.g. system("/bin/sh")), ' +
          'finds required gadgets and outputs the chain as hex bytes (little-endian).',
      )
      .string('filePath', 'Path to ELF binary')
      .enum('action', ['exec_shell', 'mmap_rwx', 'write_got', 'ret2csu'], 'Target action')
      .number('arch', 'Architecture: 32 or 64', { default: 64, minimum: 32, maximum: 64 })
      .required('filePath', 'action')
      .query(),
  ),
];
