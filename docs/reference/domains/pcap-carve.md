# PCAP Carve

域名：`pcap-carve`

PCAP 网络流量分析域，支持 TCP 流重组、文件 carving、DNS exfil 检测与 HTTP 提取。

## Profile

- full

## 典型场景

- TCP 流重组
- 文件 carving
- DNS 隐蔽隧道检测

## 常见组合

- pcap-carve + network
- pcap-carve + encoding

## 代表工具

- `pcap_stream_reassemble` — 待补充中文：Reassemble TCP streams from a PCAP file. Groups packets by TCP stream (src/dst IP+port), reassembles payloads in sequence, and returns stream data as hex/ascii.
- `pcap_carve_files` — 待补充中文：Carve files from TCP/UDP streams in a PCAP. Detects embedded file signatures (magic bytes) in reassembled streams and extracts them. Returns carved file info with offsets.
- `pcap_dns_exfil` — 待补充中文：Detect DNS exfiltration patterns in PCAP. Analyzes DNS queries for unusually long subdomain labels, high entropy domain names, sequential patterns, and base64/hex encoded subdomains.
- `pcap_http_extract` — 待补充中文：Extract HTTP request/response pairs from PCAP. Parses TCP streams for HTTP headers, extracts URLs, methods, status codes, and response bodies.

## 工具清单（4）

| 工具 | 说明 |
| --- | --- |
| `pcap_stream_reassemble` | 待补充中文：Reassemble TCP streams from a PCAP file. Groups packets by TCP stream (src/dst IP+port), reassembles payloads in sequence, and returns stream data as hex/ascii. |
| `pcap_carve_files` | 待补充中文：Carve files from TCP/UDP streams in a PCAP. Detects embedded file signatures (magic bytes) in reassembled streams and extracts them. Returns carved file info with offsets. |
| `pcap_dns_exfil` | 待补充中文：Detect DNS exfiltration patterns in PCAP. Analyzes DNS queries for unusually long subdomain labels, high entropy domain names, sequential patterns, and base64/hex encoded subdomains. |
| `pcap_http_extract` | 待补充中文：Extract HTTP request/response pairs from PCAP. Parses TCP streams for HTTP headers, extracts URLs, methods, status codes, and response bodies. |
