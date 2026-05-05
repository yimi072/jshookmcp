# Pwn Tools

域名：`pwn-tools`

二进制漏洞利用工具域，支持 ELF 解析、checksec、pattern 生成、shellcode 分析、ROP gadget 搜索与链构建。

## Profile

- full
- workflow

## 典型场景

- 二进制保护检查
- ROP gadget 搜索
- 栈溢出利用

## 常见组合

- pwn-tools + binary-instrument
- pwn-tools + memory

## 代表工具

- `pwn_checksec` — 待补充中文：Check binary security properties: RELRO, Stack Canary, NX, PIE, RPATH, RUNPATH, FORTIFY, Partial RELRO, SHSTK, IBT. Reads ELF headers and program headers.
- `pwn_elf_info` — 待补充中文：Parse ELF header and program headers: architecture, entry point, sections, dynamic linker, needed libraries, symbol tables, and GOT/PLT addresses.
- `pwn_pattern_create` — 待补充中文：Generate a De Bruijn sequence (cyclic pattern) for offset determination. Each 4-byte subsequence at a given offset is unique, enabling precise offset calculation.
- `pwn_pattern_offset` — 待补充中文：Find the offset of a value in a De Bruijn sequence. Input a 4-byte or 8-byte value (hex or decimal) that was found in a register/stack after a crash.
- `pwn_shellcode_info` — 待补充中文：Analyze shellcode: detect architecture (x86/x64/ARM), identify syscalls, find strings, detect null bytes, and match known shellcode patterns.
- `pwn_gadget_search` — 待补充中文：Search for ROP gadgets in an ELF binary. Scans executable segments for useful instruction sequences ending in ret/leave/jmp/call. Returns gadget addresses and disassembly.
- `pwn_rop_chain_build` — 待补充中文：Build a basic ROP chain from available gadgets. Given a target action (e.g. system("/bin/sh")), finds required gadgets and outputs the chain as hex bytes (little-endian).

## 工具清单（7）

| 工具 | 说明 |
| --- | --- |
| `pwn_checksec` | 待补充中文：Check binary security properties: RELRO, Stack Canary, NX, PIE, RPATH, RUNPATH, FORTIFY, Partial RELRO, SHSTK, IBT. Reads ELF headers and program headers. |
| `pwn_elf_info` | 待补充中文：Parse ELF header and program headers: architecture, entry point, sections, dynamic linker, needed libraries, symbol tables, and GOT/PLT addresses. |
| `pwn_pattern_create` | 待补充中文：Generate a De Bruijn sequence (cyclic pattern) for offset determination. Each 4-byte subsequence at a given offset is unique, enabling precise offset calculation. |
| `pwn_pattern_offset` | 待补充中文：Find the offset of a value in a De Bruijn sequence. Input a 4-byte or 8-byte value (hex or decimal) that was found in a register/stack after a crash. |
| `pwn_shellcode_info` | 待补充中文：Analyze shellcode: detect architecture (x86/x64/ARM), identify syscalls, find strings, detect null bytes, and match known shellcode patterns. |
| `pwn_gadget_search` | 待补充中文：Search for ROP gadgets in an ELF binary. Scans executable segments for useful instruction sequences ending in ret/leave/jmp/call. Returns gadget addresses and disassembly. |
| `pwn_rop_chain_build` | 待补充中文：Build a basic ROP chain from available gadgets. Given a target action (e.g. system("/bin/sh")), finds required gadgets and outputs the chain as hex bytes (little-endian). |
