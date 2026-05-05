/**
 * Minimal ELF parser for pwn-tools domain.
 * Parses ELF header, program headers, section headers, and dynamic section.
 */

export interface ElfHeader {
  class: 32 | 64;
  data: 'little' | 'big';
  type: string;
  machine: string;
  entry: number;
  phoff: number;
  shoff: number;
  phnum: number;
  shnum: number;
  shstrndx: number;
}

export interface ProgramHeader {
  type: string;
  offset: number;
  vaddr: number;
  paddr: number;
  filesz: number;
  memsz: number;
  flags: string;
  align: number;
}

export interface SectionHeader {
  name: string;
  type: string;
  flags: string;
  addr: number;
  offset: number;
  size: number;
  link: number;
  info: number;
  addralign: number;
  entsize: number;
}

export interface DynamicEntry {
  tag: string;
  value: number;
  str?: string;
}

const PT_TYPES: Record<number, string> = {
  0: 'NULL',
  1: 'LOAD',
  2: 'DYNAMIC',
  3: 'INTERP',
  4: 'NOTE',
  6: 'PHDR',
  7: 'TLS',
  0x6474e550: 'GNU_EH_FRAME',
  0x6474e551: 'GNU_STACK',
  0x6474e552: 'GNU_RELRO',
};

const SH_TYPES: Record<number, string> = {
  0: 'NULL',
  1: 'PROGBITS',
  2: 'SYMTAB',
  3: 'STRTAB',
  4: 'RELA',
  5: 'HASH',
  6: 'DYNAMIC',
  7: 'NOTE',
  8: 'NOBITS',
  9: 'REL',
  11: 'DYNSYM',
  0x6ffffff6: 'GNU_HASH',
  0x6fffffff: 'GNU_VERSYM',
};

const DT_TAGS: Record<number, string> = {
  0: 'NULL',
  1: 'NEEDED',
  2: 'PLTRELSZ',
  3: 'PLTGOT',
  4: 'HASH',
  5: 'STRTAB',
  6: 'SYMTAB',
  7: 'RELA',
  8: 'RELASZ',
  9: 'RELAENT',
  10: 'STRSZ',
  11: 'SYMENT',
  12: 'INIT',
  14: 'FINI',
  15: 'SONAME',
  16: 'RPATH',
  17: 'SYMBOLIC',
  21: 'PLTREL',
  22: 'DEBUG',
  23: 'TEXTREL',
  24: 'JMPREL',
  25: 'BIND_NOW',
  26: 'INIT_ARRAY',
  27: 'FINI_ARRAY',
  29: 'FLAGS',
  30: 'PREINIT_ARRAY',
  0x6ffffff0: 'VERSYM',
  0x6ffffffe: 'VERNEED',
  0x6fffffff: 'VERNEEDNUM',
  0x6ffffffb: 'FLAGS_1',
};

export function parseElf(buf: Buffer): {
  header: ElfHeader;
  programHeaders: ProgramHeader[];
  sectionHeaders: SectionHeader[];
  dynamic: DynamicEntry[];
  libraries: string[];
} {
  if (buf.length < 16 || buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
    throw new Error('Not a valid ELF file');
  }

  const is64 = buf[4] === 2;
  const isLE = buf[5] === 1;
  const r32 = (o: number) => (isLE ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const r16 = (o: number) => (isLE ? buf.readUInt16LE(o) : buf.readUInt16BE(o));

  // ELF Header
  const header: ElfHeader = {
    class: is64 ? 64 : 32,
    data: isLE ? 'little' : 'big',
    type:
      ({ 1: 'REL', 2: 'EXEC', 3: 'DYN', 4: 'CORE' } as Record<number, string>)[r16(16)] ??
      'UNKNOWN',
    machine:
      (
        { 0x03: 'x86', 0x28: 'ARM', 0x3e: 'x86_64', 0xb7: 'AArch64', 0x08: 'MIPS' } as Record<
          number,
          string
        >
      )[r16(18)] ?? `0x${r16(18).toString(16)}`,
    entry: is64 ? Number(buf.readBigUInt64LE?.(24) ?? BigInt(r32(24))) : r32(24),
    phoff: is64 ? Number(buf.readBigUInt64LE?.(32) ?? BigInt(r32(32))) : r32(28),
    shoff: is64 ? Number(buf.readBigUInt64LE?.(40) ?? BigInt(r32(40))) : r32(32),
    phnum: r16(is64 ? 54 : 42),
    shnum: r16(is64 ? 60 : 48),
    shstrndx: r16(is64 ? 62 : 50),
  };

  // Program Headers
  const phSize = is64 ? 56 : 32;
  const programHeaders: ProgramHeader[] = [];
  for (let i = 0; i < header.phnum; i++) {
    const off = header.phoff + i * phSize;
    if (off + phSize > buf.length) break;

    const pType = r32(off);
    let pOffset: number,
      pVaddr: number,
      pPaddr: number,
      pFilesz: number,
      pMemsz: number,
      pFlags: number,
      pAlign: number;

    if (is64) {
      pFlags = r32(off + 4);
      pOffset = Number(buf.readBigUInt64LE?.(off + 8) ?? BigInt(r32(off + 8)));
      pVaddr = Number(buf.readBigUInt64LE?.(off + 16) ?? BigInt(r32(off + 16)));
      pPaddr = Number(buf.readBigUInt64LE?.(off + 24) ?? BigInt(r32(off + 24)));
      pFilesz = Number(buf.readBigUInt64LE?.(off + 32) ?? BigInt(r32(off + 32)));
      pMemsz = Number(buf.readBigUInt64LE?.(off + 40) ?? BigInt(r32(off + 40)));
      pAlign = Number(buf.readBigUInt64LE?.(off + 48) ?? BigInt(r32(off + 48)));
    } else {
      pOffset = r32(off + 4);
      pVaddr = r32(off + 8);
      pPaddr = r32(off + 12);
      pFilesz = r32(off + 16);
      pMemsz = r32(off + 20);
      pFlags = r32(off + 24);
      pAlign = r32(off + 28);
    }

    const flagStr = (pFlags & 1 ? 'R' : '-') + (pFlags & 2 ? 'W' : '-') + (pFlags & 4 ? 'E' : '-');

    programHeaders.push({
      type: PT_TYPES[pType] ?? `0x${pType.toString(16)}`,
      offset: pOffset,
      vaddr: pVaddr,
      paddr: pPaddr,
      filesz: pFilesz,
      memsz: pMemsz,
      flags: flagStr,
      align: pAlign,
    });
  }

  // Section Headers
  const shSize = is64 ? 64 : 40;
  const sectionHeaders: SectionHeader[] = [];
  // Read section name string table
  let shStrTab: Buffer | null = null;
  if (header.shstrndx < header.shnum) {
    const strShOff = header.shoff + header.shstrndx * shSize;
    if (strShOff + shSize <= buf.length) {
      const strOff = r32(strShOff + (is64 ? 24 : 16));
      const strSize = r32(strShOff + (is64 ? 32 : 20));
      if (strOff + strSize <= buf.length) {
        shStrTab = buf.subarray(strOff, strOff + strSize);
      }
    }
  }

  for (let i = 0; i < header.shnum; i++) {
    const off = header.shoff + i * shSize;
    if (off + shSize > buf.length) break;

    const shName = r32(off);
    const shType = r32(off + 4);
    const shFlags = is64
      ? Number(buf.readBigUInt64LE?.(off + 8) ?? BigInt(r32(off + 8)))
      : r32(off + 8);
    const shAddr = is64
      ? Number(buf.readBigUInt64LE?.(off + 16) ?? BigInt(r32(off + 16)))
      : r32(off + 12);
    const shOffset = is64
      ? Number(buf.readBigUInt64LE?.(off + 24) ?? BigInt(r32(off + 24)))
      : r32(off + 16);
    const shSize2 = is64
      ? Number(buf.readBigUInt64LE?.(off + 32) ?? BigInt(r32(off + 32)))
      : r32(off + 20);

    let name = '';
    if (shStrTab && shName < shStrTab.length) {
      const end = shStrTab.indexOf(0, shName);
      name = shStrTab.toString('ascii', shName, end === -1 ? shName + 20 : end);
    }

    const flagList: string[] = [];
    if (shFlags & 0x1) flagList.push('WRITE');
    if (shFlags & 0x2) flagList.push('ALLOC');
    if (shFlags & 0x4) flagList.push('EXECINSTR');

    sectionHeaders.push({
      name,
      type: SH_TYPES[shType] ?? `0x${shType.toString(16)}`,
      flags: flagList.join(','),
      addr: shAddr,
      offset: shOffset,
      size: shSize2,
      link: r32(off + (is64 ? 40 : 24)),
      info: r32(off + (is64 ? 44 : 28)),
      addralign: is64
        ? Number(buf.readBigUInt64LE?.(off + 48) ?? BigInt(r32(off + 48)))
        : r32(off + 32),
      entsize: is64
        ? Number(buf.readBigUInt64LE?.(off + 56) ?? BigInt(r32(off + 56)))
        : r32(off + 36),
    });
  }

  // Dynamic section
  const dynamic: DynamicEntry[] = [];
  const libraries: string[] = [];
  const dynPhdr = programHeaders.find((p) => p.type === 'DYNAMIC');
  let dynStrTab: Buffer | null = null;

  if (dynPhdr) {
    const dynSize = is64 ? 16 : 8;
    for (
      let off = dynPhdr.offset;
      off + dynSize <= dynPhdr.offset + dynPhdr.filesz;
      off += dynSize
    ) {
      const tag = is64 ? Number(buf.readBigUInt64LE?.(off) ?? BigInt(r32(off))) : r32(off);
      const value = is64
        ? Number(buf.readBigUInt64LE?.(off + 8) ?? BigInt(r32(off + 8)))
        : r32(off + 4);

      if (tag === 0) break;
      const tagStr = DT_TAGS[tag] ?? `0x${tag.toString(16)}`;
      dynamic.push({ tag: tagStr, value });

      // Cache STRTAB for resolving NEEDED
      if (tag === 5) {
        // STRTAB
        const strtabPhdr = programHeaders.find(
          (p) => p.vaddr <= value && p.vaddr + p.memsz > value,
        );
        if (strtabPhdr) {
          const strOff = value - strtabPhdr.vaddr + strtabPhdr.offset;
          if (strOff < buf.length) {
            dynStrTab = buf.subarray(strOff);
          }
        }
      }
    }

    // Resolve NEEDED libraries
    if (dynStrTab) {
      for (const entry of dynamic) {
        if (entry.tag === 'NEEDED') {
          const end = dynStrTab.indexOf(0, entry.value);
          if (end !== -1) {
            libraries.push(dynStrTab.toString('ascii', entry.value, end));
          }
        }
      }
    }
  }

  return { header, programHeaders, sectionHeaders, dynamic, libraries };
}
