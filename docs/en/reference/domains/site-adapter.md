# Site Adapter

Domain: `site-adapter`

Site adapter domain with 126 community-maintained adapters covering 36+ platforms, no API keys needed.

## Profiles

- search
- workflow
- full

## Typical scenarios

- Social media data extraction
- E-commerce data collection
- API-key-free data gathering

## Common combinations

- site-adapter + real-browser
- site-adapter + workflow

## Representative tools

- `site_list` — List all available site adapters. Returns name, domain, description for each adapter. Adapters are JS functions that run in your browser to extract structured data using your login state.
- `site_info` — Show detailed info about a site adapter: metadata, args schema, domain, capabilities.
- `site_run` — Execute a site adapter in the browser. The adapter runs as JS in your tab, using your login state to fetch structured data. Returns JSON result.
- `site_search` — Search adapters by keyword. Matches against name, description, and domain.
- `site_update` — Update site adapters from the bb-sites GitHub repo. Downloads latest adapters and regenerates the index.

## Full tool list (5)

| Tool | Description |
| --- | --- |
| `site_list` | List all available site adapters. Returns name, domain, description for each adapter. Adapters are JS functions that run in your browser to extract structured data using your login state. |
| `site_info` | Show detailed info about a site adapter: metadata, args schema, domain, capabilities. |
| `site_run` | Execute a site adapter in the browser. The adapter runs as JS in your tab, using your login state to fetch structured data. Returns JSON result. |
| `site_search` | Search adapters by keyword. Matches against name, description, and domain. |
| `site_update` | Update site adapters from the bb-sites GitHub repo. Downloads latest adapters and regenerates the index. |
