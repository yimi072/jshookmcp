# Steganography

域名：`stego`

隐写分析域，支持文件扫描、LSB 提取、PNG chunks 分析、EXIF 提取、边框解码与 XOR 暴力破解。

## Profile

- full
- workflow

## 典型场景

- 图片隐写检测
- LSB 数据提取
- 元数据取证

## 常见组合

- stego + encoding
- stego + core

## 代表工具

- `stego_scan_file` — 待补充中文：Scan a file for steganography indicators: appended data after EOF, embedded magic bytes, suspicious strings, LSB density anomalies, and hidden streams. Returns a checklist of findings.
- `stego_lsb_extract` — 待补充中文：Extract Least Significant Bit data from raw image pixels. Supports PNG/BMP raw RGBA pixel data. Returns extracted bits as hex and attempts ASCII decoding.
- `stego_png_chunks` — 待补充中文：Parse and list all PNG chunks (IHDR, PLTE, IDAT, IEND, and ancillary chunks). Detects chunk reordering, duplicate chunks, suspicious ancillary chunks, and trailing data after IEND.
- `stego_exif_extract` — 待补充中文：Extract EXIF metadata, IPTC, XMP, and comment fields from JPEG/PNG files. Reports all metadata fields including GPS, camera info, and custom comments that may contain hidden data.
- `stego_border_decode` — 待补充中文：Decode binary border steganography: reads 1-pixel border around image clockwise (top->right->bottom->left), interpreting dark pixels as 0 and light pixels as 1, then converts bit groups to ASCII.
- `stego_xor_brute` — 待补充中文：Brute-force single-byte XOR on input data. Tests all 256 keys and ranks results by English character frequency score. Useful for finding XOR-encoded hidden messages.

## 工具清单（6）

| 工具 | 说明 |
| --- | --- |
| `stego_scan_file` | 待补充中文：Scan a file for steganography indicators: appended data after EOF, embedded magic bytes, suspicious strings, LSB density anomalies, and hidden streams. Returns a checklist of findings. |
| `stego_lsb_extract` | 待补充中文：Extract Least Significant Bit data from raw image pixels. Supports PNG/BMP raw RGBA pixel data. Returns extracted bits as hex and attempts ASCII decoding. |
| `stego_png_chunks` | 待补充中文：Parse and list all PNG chunks (IHDR, PLTE, IDAT, IEND, and ancillary chunks). Detects chunk reordering, duplicate chunks, suspicious ancillary chunks, and trailing data after IEND. |
| `stego_exif_extract` | 待补充中文：Extract EXIF metadata, IPTC, XMP, and comment fields from JPEG/PNG files. Reports all metadata fields including GPS, camera info, and custom comments that may contain hidden data. |
| `stego_border_decode` | 待补充中文：Decode binary border steganography: reads 1-pixel border around image clockwise (top-&gt;right-&gt;bottom-&gt;left), interpreting dark pixels as 0 and light pixels as 1, then converts bit groups to ASCII. |
| `stego_xor_brute` | 待补充中文：Brute-force single-byte XOR on input data. Tests all 256 keys and ranks results by English character frequency score. Useful for finding XOR-encoded hidden messages. |
