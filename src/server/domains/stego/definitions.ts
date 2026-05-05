import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { tool } from '@server/registry/tool-builder';

export const stegoTools: Tool[] = [
  tool('stego_scan_file', (t) =>
    t
      .desc(
        'Scan a file for steganography indicators: appended data after EOF, embedded magic bytes, ' +
          'suspicious strings, LSB density anomalies, and hidden streams. Returns a checklist of findings.',
      )
      .string('filePath', 'Path to the file to analyze')
      .required('filePath')
      .query(),
  ),

  tool('stego_lsb_extract', (t) =>
    t
      .desc(
        'Extract Least Significant Bit data from raw image pixels. Supports PNG/BMP raw RGBA pixel data. ' +
          'Returns extracted bits as hex and attempts ASCII decoding.',
      )
      .string('filePath', 'Path to image file (PNG/BMP)')
      .enum(
        'bitPlane',
        ['0', '1', '2', '3', '4', '5', '6', '7'],
        'Which bit plane to extract (0=LSB)',
        {
          default: '0',
        },
      )
      .enum('channel', ['r', 'g', 'b', 'a', 'rgb', 'rgba'], 'Which color channel(s)', {
        default: 'rgb',
      })
      .number('maxBytes', 'Maximum bytes to extract', {
        default: 4096,
        minimum: 64,
        maximum: 65536,
      })
      .required('filePath')
      .query(),
  ),

  tool('stego_png_chunks', (t) =>
    t
      .desc(
        'Parse and list all PNG chunks (IHDR, PLTE, IDAT, IEND, and ancillary chunks). ' +
          'Detects chunk reordering, duplicate chunks, suspicious ancillary chunks, and trailing data after IEND.',
      )
      .string('filePath', 'Path to PNG file')
      .required('filePath')
      .query(),
  ),

  tool('stego_exif_extract', (t) =>
    t
      .desc(
        'Extract EXIF metadata, IPTC, XMP, and comment fields from JPEG/PNG files. ' +
          'Reports all metadata fields including GPS, camera info, and custom comments that may contain hidden data.',
      )
      .string('filePath', 'Path to image file (JPEG/PNG)')
      .required('filePath')
      .query(),
  ),

  tool('stego_border_decode', (t) =>
    t
      .desc(
        'Decode binary border steganography: reads 1-pixel border around image clockwise (top->right->bottom->left), ' +
          'interpreting dark pixels as 0 and light pixels as 1, then converts bit groups to ASCII.',
      )
      .string('filePath', 'Path to image file')
      .number('threshold', 'Brightness threshold (0-765) for 0/1 classification', {
        default: 384,
        minimum: 0,
        maximum: 765,
      })
      .required('filePath')
      .query(),
  ),

  tool('stego_xor_brute', (t) =>
    t
      .desc(
        'Brute-force single-byte XOR on input data. Tests all 256 keys and ranks results by ' +
          'English character frequency score. Useful for finding XOR-encoded hidden messages.',
      )
      .string('data', 'Input data as hex string')
      .string('filePath', 'Path to file (alternative to data)')
      .number('topN', 'Number of top results to return', { default: 10, minimum: 1, maximum: 50 })
      .query(),
  ),
];
