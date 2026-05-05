# Site Adapter

域名：`site-adapter`

站点适配器域，126 个社区维护的适配器覆盖 36+ 平台，无需 API key。

## Profile

- search
- workflow
- full

## 典型场景

- 社交媒体数据抓取
- 电商网站数据采集
- 无需 API key 的数据提取

## 常见组合

- site-adapter + real-browser
- site-adapter + workflow

## 代表工具

- `site_list` — 待补充中文：List all available site adapters. Returns name, domain, description for each adapter. Adapters are JS functions that run in your browser to extract structured data using your login state.
- `site_info` — 待补充中文：Show detailed info about a site adapter: metadata, args schema, domain, capabilities.
- `site_run` — 待补充中文：Execute a site adapter in the browser. The adapter runs as JS in your tab, using your login state to fetch structured data. Returns JSON result.
- `site_search` — 待补充中文：Search adapters by keyword. Matches against name, description, and domain.
- `site_update` — 待补充中文：Update site adapters from the bb-sites GitHub repo. Downloads latest adapters and regenerates the index.

## 工具清单（5）

| 工具 | 说明 |
| --- | --- |
| `site_list` | 待补充中文：List all available site adapters. Returns name, domain, description for each adapter. Adapters are JS functions that run in your browser to extract structured data using your login state. |
| `site_info` | 待补充中文：Show detailed info about a site adapter: metadata, args schema, domain, capabilities. |
| `site_run` | 待补充中文：Execute a site adapter in the browser. The adapter runs as JS in your tab, using your login state to fetch structured data. Returns JSON result. |
| `site_search` | 待补充中文：Search adapters by keyword. Matches against name, description, and domain. |
| `site_update` | 待补充中文：Update site adapters from the bb-sites GitHub repo. Downloads latest adapters and regenerates the index. |
