import { readFile } from 'node:fs/promises';
import { argString, argNumber, argEnum } from '@server/domains/shared/parse-args';

const ok = (data: unknown) => data;
const fail = (tool: string, error: unknown) => ({
  success: false,
  tool,
  error: error instanceof Error ? error.message : String(error),
});

// ── PNG chunk parsing ──

interface PngChunk {
  type: string;
  length: number;
  offset: number;
  crc: string;
  critical: boolean;
  public_: boolean;
  safeToCopy: boolean;
}

function parsePngChunks(buf: Buffer): { chunks: PngChunk[]; trailingBytes: number } {
  const chunks: PngChunk[] = [];
  let pos = 8; // skip PNG signature

  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const typeCode = type.charCodeAt(0);
    const chunk: PngChunk = {
      type,
      length,
      offset: pos,
      crc: buf.subarray(pos + 8 + length, pos + 12 + length).toString('hex'),
      critical: (typeCode & 0x20) === 0,
      public_: (typeCode & 0x20) === 0, // bit 5 = 0 means public
      safeToCopy: (typeCode & 0x20) !== 0,
    };
    chunks.push(chunk);
    pos += 12 + length;
    if (type === 'IEND') break;
  }

  return { chunks, trailingBytes: Math.max(0, buf.length - pos) };
}

// ── EXIF extraction (minimal JPEG EXIF parser) ──

function extractJpegExif(buf: Buffer): Record<string, unknown> {
  const result: Record<string, unknown> = { format: 'JPEG', markers: [] as unknown[] };
  let pos = 0;

  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) break;
    const marker = buf[pos + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS

    const len = buf.readUInt16BE(pos + 2);
    if (marker === 0xe1) {
      // APP1 - EXIF
      const exifData = buf.subarray(pos + 4, pos + 2 + len);
      const header = exifData.toString('ascii', 0, 6);
      if (header.startsWith('Exif')) {
        result.hasExif = true;
        result.exifBytes = exifData.length - 6;
        // Extract ASCII tags naively
        const ascii = exifData.toString('ascii', 6);
        const tags = ascii.match(/[A-Za-z0-9 _.-]{4,}/g) ?? [];
        result.exifStrings = tags.slice(0, 30);
      }
    } else if (marker === 0xfe) {
      // COM - Comment
      const comment = buf
        .subarray(pos + 4, pos + 2 + len)
        .toString('utf8')
        .split('\\x00')[0];
      if (comment.trim()) {
        (result.markers as unknown[]).push({ type: 'COM', value: comment.trim() });
      }
    } else if (marker === 0xe0) {
      // APP0 - JFIF
      result.jfif = buf
        .subarray(pos + 4, pos + 2 + len)
        .toString('ascii')
        .split('\\x00')[0]
        .trim();
    }
    pos += 2 + len;
  }

  return result;
}

function extractPngText(buf: Buffer): Record<string, unknown>[] {
  const texts: Record<string, unknown>[] = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const data = buf.subarray(pos + 8, pos + 8 + length);
      const nullIdx = data.indexOf(0);
      if (nullIdx > 0) {
        const keyword = data.subarray(0, nullIdx).toString('ascii');
        const value = data
          .subarray(nullIdx + 1)
          .toString('utf8')
          .split('\\x00')[0];
        texts.push({ type, keyword, value: value.slice(0, 500) });
      }
    }
    pos += 12 + length;
    if (type === 'IEND') break;
  }
  return texts;
}

// ── XOR brute force ──

function scoreEnglish(text: string): number {
  let score = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) score += 1;
    if (c === 32) score += 3; // space bonus
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) score += 2; // letters
    if (c >= 48 && c <= 57) score += 1; // digits
  }
  return score / Math.max(text.length, 1);
}

// ── Handlers ──

export class StegoToolHandlers {
  async handleScanFile(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      const findings: string[] = [];
      const magic = buf.subarray(0, 8).toString('hex');

      // Detect format
      let format = 'unknown';
      if (buf[0] === 0x89 && buf[1] === 0x50) format = 'PNG';
      else if (buf[0] === 0xff && buf[1] === 0xd8) format = 'JPEG';
      else if (buf[0] === 0x47 && buf[1] === 0x49) format = 'GIF';
      else if (buf[0] === 0x42 && buf[1] === 0x4d) format = 'BMP';

      // Check for appended data after EOF
      if (format === 'PNG') {
        let pos = 8;
        while (pos + 8 <= buf.length) {
          const length = buf.readUInt32BE(pos);
          const type = buf.toString('ascii', pos + 4, pos + 8);
          pos += 12 + length;
          if (type === 'IEND') break;
        }
        if (pos < buf.length) {
          const appended = buf.length - pos;
          findings.push(`APPENDED_DATA: ${appended} bytes after IEND (offset ${pos})`);
          // Check if appended data has known magic
          const appendedMagic = buf.subarray(pos, pos + 4).toString('hex');
          findings.push(`APPENDED_MAGIC: ${appendedMagic}`);
        }
      } else if (format === 'JPEG') {
        let pos = 0;
        while (pos + 4 <= buf.length) {
          if (buf[pos] !== 0xff) break;
          const marker = buf[pos + 1];
          if (marker === 0xd9) {
            // EOI
            if (pos + 2 < buf.length) {
              findings.push(
                `APPENDED_DATA: ${buf.length - pos - 2} bytes after EOI (offset ${pos + 2})`,
              );
            }
            break;
          }
          const len = buf.readUInt16BE(pos + 2);
          pos += 2 + len;
        }
      }

      // Scan for embedded file signatures (magic bytes)
      const SIGNATURES: [string, Buffer][] = [
        ['PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
        ['JPEG', Buffer.from([0xff, 0xd8, 0xff])],
        ['GIF87a', Buffer.from('GIF87a')],
        ['GIF89a', Buffer.from('GIF89a')],
        ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
        ['RAR', Buffer.from([0x52, 0x61, 0x72, 0x21])],
        ['7Z', Buffer.from([0x37, 0x7a, 0xbc, 0xaf])],
        ['PDF', Buffer.from('%PDF')],
        ['ELF', Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
        ['GZIP', Buffer.from([0x1f, 0x8b])],
        ['BZ2', Buffer.from('BZ')],
        ['PK', Buffer.from([0x50, 0x4b])],
      ];

      for (const [name, sig] of SIGNATURES) {
        const searchStart = sig.length; // skip the file's own header
        const idx = buf.indexOf(sig, searchStart);
        if (idx !== -1) {
          findings.push(`EMBEDDED_${name.toUpperCase()}: found at offset ${idx}`);
        }
      }

      // Strings analysis
      const ascii = buf.toString('ascii');
      const longStrings = ascii.match(/[\x20-\x7e]{20,}/g) ?? [];
      const suspiciousPatterns = [
        /flag\{[^}]+\}/gi,
        /CTF\{[^}]+\}/gi,
        /key[:=]\s*\S+/gi,
        /password[:=]\s*\S+/gi,
        /secret[:=]\s*\S+/gi,
        /base64/gi,
        /BEGIN\s+(RSA|PGP|CERTIFICATE)/gi,
      ];

      for (const pattern of suspiciousPatterns) {
        const matches = ascii.match(pattern);
        if (matches) {
          findings.push(`SUSPICIOUS_STRING: ${matches[0].slice(0, 100)}`);
        }
      }

      // Entropy check
      const freq: number[] = Array.from({ length: 256 }).fill(0) as number[];
      for (let i = 0; i < buf.length; i++) {
        const b = buf[i];
        if (b !== undefined) {
          freq[b] = (freq[b] ?? 0) + 1;
        }
      }
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        const f = freq[i];
        if (f !== undefined && f > 0) {
          const p = f / buf.length;
          entropy -= p * Math.log2(p);
        }
      }

      if (entropy > 7.5)
        findings.push(`HIGH_ENTROPY: ${entropy.toFixed(2)} (possible encryption/compression)`);

      return ok({
        success: true,
        filePath,
        format,
        fileSize: buf.length,
        magic,
        entropy: parseFloat(entropy.toFixed(4)),
        findingCount: findings.length,
        findings,
        longStrings: longStrings.slice(0, 10).map((s) => s.slice(0, 200)),
      });
    } catch (error) {
      return fail('stego_scan_file', error);
    }
  }

  async handleLsbExtract(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const bitPlane = parseInt(
        argEnum(args, 'bitPlane', new Set(['0', '1', '2', '3', '4', '5', '6', '7']), '0'),
      );
      const channel = argEnum(args, 'channel', new Set(['r', 'g', 'b', 'a', 'rgb', 'rgba']), 'rgb');
      const maxBytes = argNumber(args, 'maxBytes', 4096);

      const buf = await readFile(filePath);
      let pixels: Buffer;

      if (buf[0] === 0x89 && buf[1] === 0x50) {
        // PNG — scan IDAT chunks for pixel data
        const ihdrEnd = buf.indexOf('IDAT');
        if (ihdrEnd === -1) throw new Error('No IDAT chunks found in PNG');
        // Use all bytes after first IDAT as approximation
        pixels = buf.subarray(ihdrEnd);
      } else if (buf[0] === 0x42 && buf[1] === 0x4d) {
        // BMP — pixel data starts at offset defined in header
        const dataOffset = buf.readUInt32LE(10);
        pixels = buf.subarray(dataOffset);
      } else {
        throw new Error('Unsupported format. Use PNG or BMP.');
      }

      const bits: number[] = [];
      const channelOffsets: Record<string, number[]> = {
        r: [0],
        g: [1],
        b: [2],
        a: [3],
        rgb: [0, 1, 2],
        rgba: [0, 1, 2, 3],
      };
      const offsets = channelOffsets[channel] ?? [0, 1, 2];

      // Extract bits from specified channel(s) and bit plane
      const step = 4; // assume RGBA
      for (let i = 0; i + step <= pixels.length && bits.length < maxBytes * 8; i += step) {
        for (const off of offsets) {
          const pixIdx = i + off;
          if (pixIdx < pixels.length) {
            const pix = pixels[pixIdx];
            if (pix !== undefined) {
              bits.push((pix >> bitPlane) & 1);
            }
          }
        }
      }

      // Convert bits to bytes
      const bytes: number[] = [];
      for (let i = 0; i + 7 < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
          const bit = bits[i + j];
          if (bit !== undefined) byte = (byte << 1) | bit;
        }
        bytes.push(byte);
      }

      const hex = Buffer.from(bytes).toString('hex');
      const ascii = Buffer.from(bytes)
        .toString('ascii')
        .replace(/[^\x20-\x7e]/g, '.');

      return ok({
        success: true,
        filePath,
        bitPlane,
        channel,
        bitsExtracted: bits.length,
        bytesExtracted: bytes.length,
        hex: hex.slice(0, 2048),
        ascii: ascii.slice(0, 2048),
      });
    } catch (error) {
      return fail('stego_lsb_extract', error);
    }
  }

  async handlePngChunks(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      if (buf[0] !== 0x89 || buf[1] !== 0x50) {
        throw new Error('Not a PNG file');
      }

      const { chunks, trailingBytes } = parsePngChunks(buf);
      const ancillaryChunks = chunks.filter((c) => !c.critical);
      const duplicates = chunks.reduce<Record<string, number>>((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {});
      const dupTypes = Object.entries(duplicates)
        .filter(([, count]) => count > 1)
        .map(([type, count]) => `${type}x${count}`);

      return ok({
        success: true,
        filePath,
        fileSize: buf.length,
        chunkCount: chunks.length,
        trailingBytes,
        chunks: chunks.map((c) => ({
          type: c.type,
          length: c.length,
          offset: c.offset,
          critical: c.critical,
          crc: c.crc,
        })),
        ancillaryTypes: ancillaryChunks.map((c) => c.type),
        duplicateTypes: dupTypes,
        textChunks: extractPngText(buf),
      });
    } catch (error) {
      return fail('stego_png_chunks', error);
    }
  }

  async handleExifExtract(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');

      const buf = await readFile(filePath);
      let result: Record<string, unknown>;

      if (buf[0] === 0xff && buf[1] === 0xd8) {
        result = extractJpegExif(buf);
      } else if (buf[0] === 0x89 && buf[1] === 0x50) {
        result = {
          format: 'PNG',
          textChunks: extractPngText(buf),
        };
      } else {
        throw new Error('Unsupported format. Use JPEG or PNG.');
      }

      return ok({ success: true, filePath, ...result });
    } catch (error) {
      return fail('stego_exif_extract', error);
    }
  }

  async handleBorderDecode(args: Record<string, unknown>) {
    try {
      const filePath = argString(args, 'filePath', '');
      if (!filePath) throw new Error('filePath is required');
      const threshold = argNumber(args, 'threshold', 384);

      const buf = await readFile(filePath);
      // For BMP, parse header to get dimensions and pixel data
      if (buf[0] !== 0x42 || buf[1] !== 0x4d) {
        throw new Error('Only BMP supported for border decode. Convert image to BMP first.');
      }

      const width = buf.readUInt32LE(18);
      const height = buf.readUInt32LE(22);
      const bpp = buf.readUInt16LE(28);
      const dataOffset = buf.readUInt32LE(10);
      const rowSize = Math.floor((bpp * width + 31) / 32) * 4; // BMP rows are 4-byte aligned

      const getPixel = (x: number, y: number): number => {
        const bmpY = height - 1 - y; // BMP is bottom-up
        const offset = dataOffset + bmpY * rowSize + x * (bpp / 8);
        if (offset + 3 > buf.length) return 0;
        const r = buf[offset + 2];
        const g = buf[offset + 1];
        const b = buf[offset];
        if (r === undefined || g === undefined || b === undefined) return 0;
        return r + g + b;
      };

      const bits: number[] = [];

      // Top row
      for (let x = 0; x < width; x++) bits.push(getPixel(x, 0) < threshold ? 0 : 1);
      // Right column (skip first)
      for (let y = 1; y < height; y++) bits.push(getPixel(width - 1, y) < threshold ? 0 : 1);
      // Bottom row (reversed, skip last)
      for (let x = width - 2; x >= 0; x--) bits.push(getPixel(x, height - 1) < threshold ? 0 : 1);
      // Left column (reversed, skip first and last)
      for (let y = height - 2; y >= 1; y--) bits.push(getPixel(0, y) < threshold ? 0 : 1);

      // Convert to ASCII
      const bytes: number[] = [];
      for (let i = 0; i + 7 < bits.length; i += 8) {
        let byte = 0;
        for (let j = 0; j < 8; j++) {
          const bit = bits[i + j];
          if (bit !== undefined) byte = (byte << 1) | bit;
        }
        bytes.push(byte);
      }

      const decoded = Buffer.from(bytes)
        .toString('ascii')
        .replace(/[^\x20-\x7e]/g, '.');

      return ok({
        success: true,
        filePath,
        width,
        height,
        borderPixels: bits.length,
        bitsToAscii: decoded.slice(0, 4096),
        hex: Buffer.from(bytes).toString('hex').slice(0, 2048),
      });
    } catch (error) {
      return fail('stego_border_decode', error);
    }
  }

  async handleXorBrute(args: Record<string, unknown>) {
    try {
      const dataHex = argString(args, 'data', '');
      const filePath = argString(args, 'filePath', '');
      const topN = argNumber(args, 'topN', 10);

      let buf: Buffer;
      if (dataHex) {
        buf = Buffer.from(dataHex, 'hex');
      } else if (filePath) {
        buf = await readFile(filePath);
      } else {
        throw new Error('Either data (hex) or filePath is required');
      }

      const results: { key: number; score: number; hex: string; ascii: string }[] = [];

      for (let key = 0; key < 256; key++) {
        const decoded = Buffer.alloc(buf.length);
        for (let i = 0; i < buf.length; i++) {
          const b = buf[i];
          if (b !== undefined) decoded[i] = b ^ key;
        }
        const ascii = decoded.toString('ascii');
        const score = scoreEnglish(ascii);
        results.push({
          key,
          score: parseFloat(score.toFixed(4)),
          hex: decoded.toString('hex').slice(0, 128),
          ascii: ascii.replace(/[^\x20-\x7e]/g, '.').slice(0, 128),
        });
      }

      results.sort((a, b) => b.score - a.score);

      return ok({
        success: true,
        inputBytes: buf.length,
        topResults: results.slice(0, topN),
      });
    } catch (error) {
      return fail('stego_xor_brute', error);
    }
  }
}
