# YARA Scan

Domain: `yara-scan`

YARA-style pattern scanning domain supporting built-in rule matching, custom rule generation, and PE suspicious indicator detection.

## Profiles

- full
- workflow

## Typical scenarios

- Malware pattern matching
- PE suspicious indicator detection
- Custom rule generation

## Common combinations

- yara-scan + binary-instrument
- yara-scan + process

## Representative tools

- `yara_scan` — Scan a file or hex data against YARA rules. Supports inline rule strings or rule files. Returns matched rules and matched strings with offsets.
- `yara_list_rules` — List available built-in YARA rules. Returns rule names, descriptions, and categories. Includes common CTF patterns: flag detection, crypto constants, shellcode, packing.
- `yara_create_rule` — Generate a YARA rule from detected patterns. Input hex strings, ASCII patterns, or byte sequences and get a valid YARA rule that can be used for scanning.
- `yara_pe_indicators` — Scan PE file for suspicious indicators using pattern matching: anti-debug strings, crypto constants, known malware signatures, packing indicators, suspicious imports, and section anomalies.

## Full tool list (4)

| Tool | Description |
| --- | --- |
| `yara_scan` | Scan a file or hex data against YARA rules. Supports inline rule strings or rule files. Returns matched rules and matched strings with offsets. |
| `yara_list_rules` | List available built-in YARA rules. Returns rule names, descriptions, and categories. Includes common CTF patterns: flag detection, crypto constants, shellcode, packing. |
| `yara_create_rule` | Generate a YARA rule from detected patterns. Input hex strings, ASCII patterns, or byte sequences and get a valid YARA rule that can be used for scanning. |
| `yara_pe_indicators` | Scan PE file for suspicious indicators using pattern matching: anti-debug strings, crypto constants, known malware signatures, packing indicators, suspicious imports, and section anomalies. |
