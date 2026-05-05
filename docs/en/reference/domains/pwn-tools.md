# Pwn Tools

Domain: `pwn-tools`

Binary exploitation tooling domain supporting ELF parsing, checksec, pattern generation, shellcode analysis, ROP gadget search and chain building.

## Profiles

- full
- workflow

## Typical scenarios

- Binary protection check
- ROP gadget search
- Stack overflow exploitation

## Common combinations

- pwn-tools + binary-instrument
- pwn-tools + memory

## Representative tools

- `pwn_checksec` — Check binary security properties: RELRO, Stack Canary, NX, PIE, RPATH, RUNPATH, FORTIFY, Partial RELRO, SHSTK, IBT. Reads ELF headers and program headers.
- `pwn_elf_info` — Parse ELF header and program headers: architecture, entry point, sections, dynamic linker, needed libraries, symbol tables, and GOT/PLT addresses.
- `pwn_pattern_create` — Generate a De Bruijn sequence (cyclic pattern) for offset determination. Each 4-byte subsequence at a given offset is unique, enabling precise offset calculation.
- `pwn_pattern_offset` — Find the offset of a value in a De Bruijn sequence. Input a 4-byte or 8-byte value (hex or decimal) that was found in a register/stack after a crash.
- `pwn_shellcode_info` — Analyze shellcode: detect architecture (x86/x64/ARM), identify syscalls, find strings, detect null bytes, and match known shellcode patterns.
- `pwn_gadget_search` — Search for ROP gadgets in an ELF binary. Scans executable segments for useful instruction sequences ending in ret/leave/jmp/call. Returns gadget addresses and disassembly.
- `pwn_rop_chain_build` — Build a basic ROP chain from available gadgets. Given a target action (e.g. system("/bin/sh")), finds required gadgets and outputs the chain as hex bytes (little-endian).

## Full tool list (7)

| Tool | Description |
| --- | --- |
| `pwn_checksec` | Check binary security properties: RELRO, Stack Canary, NX, PIE, RPATH, RUNPATH, FORTIFY, Partial RELRO, SHSTK, IBT. Reads ELF headers and program headers. |
| `pwn_elf_info` | Parse ELF header and program headers: architecture, entry point, sections, dynamic linker, needed libraries, symbol tables, and GOT/PLT addresses. |
| `pwn_pattern_create` | Generate a De Bruijn sequence (cyclic pattern) for offset determination. Each 4-byte subsequence at a given offset is unique, enabling precise offset calculation. |
| `pwn_pattern_offset` | Find the offset of a value in a De Bruijn sequence. Input a 4-byte or 8-byte value (hex or decimal) that was found in a register/stack after a crash. |
| `pwn_shellcode_info` | Analyze shellcode: detect architecture (x86/x64/ARM), identify syscalls, find strings, detect null bytes, and match known shellcode patterns. |
| `pwn_gadget_search` | Search for ROP gadgets in an ELF binary. Scans executable segments for useful instruction sequences ending in ret/leave/jmp/call. Returns gadget addresses and disassembly. |
| `pwn_rop_chain_build` | Build a basic ROP chain from available gadgets. Given a target action (e.g. system("/bin/sh")), finds required gadgets and outputs the chain as hex bytes (little-endian). |
