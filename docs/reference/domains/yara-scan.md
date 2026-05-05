# YARA Scan

域名：`yara-scan`

YARA 风格模式扫描域，支持内置规则匹配、自定义规则生成与 PE 可疑指标检测。

## Profile

- full
- workflow

## 典型场景

- 恶意软件模式匹配
- PE 可疑指标检测
- 自定义规则生成

## 常见组合

- yara-scan + binary-instrument
- yara-scan + process

## 代表工具

- `yara_scan` — 待补充中文：Scan a file or hex data against YARA rules. Supports inline rule strings or rule files. Returns matched rules and matched strings with offsets.
- `yara_list_rules` — 待补充中文：List available built-in YARA rules. Returns rule names, descriptions, and categories. Includes common CTF patterns: flag detection, crypto constants, shellcode, packing.
- `yara_create_rule` — 待补充中文：Generate a YARA rule from detected patterns. Input hex strings, ASCII patterns, or byte sequences and get a valid YARA rule that can be used for scanning.
- `yara_pe_indicators` — 待补充中文：Scan PE file for suspicious indicators using pattern matching: anti-debug strings, crypto constants, known malware signatures, packing indicators, suspicious imports, and section anomalies.

## 工具清单（4）

| 工具 | 说明 |
| --- | --- |
| `yara_scan` | 待补充中文：Scan a file or hex data against YARA rules. Supports inline rule strings or rule files. Returns matched rules and matched strings with offsets. |
| `yara_list_rules` | 待补充中文：List available built-in YARA rules. Returns rule names, descriptions, and categories. Includes common CTF patterns: flag detection, crypto constants, shellcode, packing. |
| `yara_create_rule` | 待补充中文：Generate a YARA rule from detected patterns. Input hex strings, ASCII patterns, or byte sequences and get a valid YARA rule that can be used for scanning. |
| `yara_pe_indicators` | 待补充中文：Scan PE file for suspicious indicators using pattern matching: anti-debug strings, crypto constants, known malware signatures, packing indicators, suspicious imports, and section anomalies. |
