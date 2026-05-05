# Steganography

Domain: `stego`

Steganography analysis domain supporting file scanning, LSB extraction, PNG chunk analysis, EXIF extraction, border decoding, and XOR brute-forcing.

## Profiles

- full
- workflow

## Typical scenarios

- Image steganography detection
- LSB data extraction
- Metadata forensics

## Common combinations

- stego + encoding
- stego + core

## Representative tools

- `stego_scan_file` — Scan a file for steganography indicators: appended data after EOF, embedded magic bytes, suspicious strings, LSB density anomalies, and hidden streams. Returns a checklist of findings.
- `stego_lsb_extract` — Extract Least Significant Bit data from raw image pixels. Supports PNG/BMP raw RGBA pixel data. Returns extracted bits as hex and attempts ASCII decoding.
- `stego_png_chunks` — Parse and list all PNG chunks (IHDR, PLTE, IDAT, IEND, and ancillary chunks). Detects chunk reordering, duplicate chunks, suspicious ancillary chunks, and trailing data after IEND.
- `stego_exif_extract` — Extract EXIF metadata, IPTC, XMP, and comment fields from JPEG/PNG files. Reports all metadata fields including GPS, camera info, and custom comments that may contain hidden data.
- `stego_border_decode` — Decode binary border steganography: reads 1-pixel border around image clockwise (top->right->bottom->left), interpreting dark pixels as 0 and light pixels as 1, then converts bit groups to ASCII.
- `stego_xor_brute` — Brute-force single-byte XOR on input data. Tests all 256 keys and ranks results by English character frequency score. Useful for finding XOR-encoded hidden messages.

## Full tool list (6)

| Tool | Description |
| --- | --- |
| `stego_scan_file` | Scan a file for steganography indicators: appended data after EOF, embedded magic bytes, suspicious strings, LSB density anomalies, and hidden streams. Returns a checklist of findings. |
| `stego_lsb_extract` | Extract Least Significant Bit data from raw image pixels. Supports PNG/BMP raw RGBA pixel data. Returns extracted bits as hex and attempts ASCII decoding. |
| `stego_png_chunks` | Parse and list all PNG chunks (IHDR, PLTE, IDAT, IEND, and ancillary chunks). Detects chunk reordering, duplicate chunks, suspicious ancillary chunks, and trailing data after IEND. |
| `stego_exif_extract` | Extract EXIF metadata, IPTC, XMP, and comment fields from JPEG/PNG files. Reports all metadata fields including GPS, camera info, and custom comments that may contain hidden data. |
| `stego_border_decode` | Decode binary border steganography: reads 1-pixel border around image clockwise (top-&gt;right-&gt;bottom-&gt;left), interpreting dark pixels as 0 and light pixels as 1, then converts bit groups to ASCII. |
| `stego_xor_brute` | Brute-force single-byte XOR on input data. Tests all 256 keys and ranks results by English character frequency score. Useful for finding XOR-encoded hidden messages. |
