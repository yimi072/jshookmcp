# WASM

Domain: `wasm`

WebAssembly dump, disassembly, decompilation, optimization, and offline execution domain.

## Profiles

- full

## Typical scenarios

- Dump WASM modules
- Recover WAT or pseudo-C
- Run exported functions offline

## Common combinations

- browser + wasm
- core + wasm

## Representative tools

- `wasm_capabilities` — Report WASM tool availability.
- `wasm_dump` — Dump a captured WebAssembly module from the current page.
- `wasm_disassemble` — Disassemble a .wasm file to WAT.
- `wasm_decompile` — Decompile a .wasm file to pseudo-code.
- `wasm_inspect_sections` — Inspect sections and metadata of a .wasm file.
- `wasm_offline_run` — Run an exported .wasm function.
- `wasm_optimize` — Optimize a .wasm file.
- `wasm_vmp_trace` — Read captured WASM VMP import-call traces from the current page.
- `wasm_memory_inspect` — Inspect exported WebAssembly.Memory from the current page.
- `wasm_to_c` — Convert a .wasm file to C source and header.

## Full tool list (12)

| Tool | Description |
| --- | --- |
| `wasm_capabilities` | Report WASM tool availability. |
| `wasm_dump` | Dump a captured WebAssembly module from the current page. |
| `wasm_disassemble` | Disassemble a .wasm file to WAT. |
| `wasm_decompile` | Decompile a .wasm file to pseudo-code. |
| `wasm_inspect_sections` | Inspect sections and metadata of a .wasm file. |
| `wasm_offline_run` | Run an exported .wasm function. |
| `wasm_optimize` | Optimize a .wasm file. |
| `wasm_vmp_trace` | Read captured WASM VMP import-call traces from the current page. |
| `wasm_memory_inspect` | Inspect exported WebAssembly.Memory from the current page. |
| `wasm_to_c` | Convert a .wasm file to C source and header. |
| `wasm_detect_obfuscation` | Detect obfuscation patterns in a .wasm file. |
| `wasm_instrument_trace` | Generate a JS instrumentation wrapper for a .wasm module. |
