# PCAP Carve

Domain: `pcap-carve`

PCAP network traffic analysis domain supporting TCP stream reassembly, file carving, DNS exfiltration detection, and HTTP extraction.

## Profiles

- full

## Typical scenarios

- TCP stream reassembly
- File carving from traffic
- DNS covert channel detection

## Common combinations

- pcap-carve + network
- pcap-carve + encoding

## Representative tools

- `pcap_stream_reassemble` — Reassemble TCP streams from a PCAP file. Groups packets by TCP stream (src/dst IP+port), reassembles payloads in sequence, and returns stream data as hex/ascii.
- `pcap_carve_files` — Carve files from TCP/UDP streams in a PCAP. Detects embedded file signatures (magic bytes) in reassembled streams and extracts them. Returns carved file info with offsets.
- `pcap_dns_exfil` — Detect DNS exfiltration patterns in PCAP. Analyzes DNS queries for unusually long subdomain labels, high entropy domain names, sequential patterns, and base64/hex encoded subdomains.
- `pcap_http_extract` — Extract HTTP request/response pairs from PCAP. Parses TCP streams for HTTP headers, extracts URLs, methods, status codes, and response bodies.

## Full tool list (4)

| Tool | Description |
| --- | --- |
| `pcap_stream_reassemble` | Reassemble TCP streams from a PCAP file. Groups packets by TCP stream (src/dst IP+port), reassembles payloads in sequence, and returns stream data as hex/ascii. |
| `pcap_carve_files` | Carve files from TCP/UDP streams in a PCAP. Detects embedded file signatures (magic bytes) in reassembled streams and extracts them. Returns carved file info with offsets. |
| `pcap_dns_exfil` | Detect DNS exfiltration patterns in PCAP. Analyzes DNS queries for unusually long subdomain labels, high entropy domain names, sequential patterns, and base64/hex encoded subdomains. |
| `pcap_http_extract` | Extract HTTP request/response pairs from PCAP. Parses TCP streams for HTTP headers, extracts URLs, methods, status codes, and response bodies. |
