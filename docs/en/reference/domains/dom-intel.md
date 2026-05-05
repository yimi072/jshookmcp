# DOM Intel

Domain: `dom-intel`

DOM intelligence collection domain supporting page structure analysis, element fingerprinting, and dynamic behavior tracking.

## Profiles

- workflow
- full

## Typical scenarios

- Page structure analysis
- Element fingerprint extraction
- Dynamic behavior tracking

## Common combinations

- dom-intel + browser
- dom-intel + hooks

## Representative tools

- `dom_scan` — Scan a page: extract simplified HTML with visibility analysis, overlay detection, and list truncation.
- `dom_find_lists` — Find main list containers in the current page (feed, search results, tables).
- `dom_diff` — Compare two HTML snapshots and return the changes.
- `dom_optimize` — Optimize HTML for token efficiency: strip styles, truncate long attributes, compress data-* attributes.
- `dom_extract_text` — Extract clean text from HTML: collapse whitespace, describe form fields.

## Full tool list (5)

| Tool | Description |
| --- | --- |
| `dom_scan` | Scan a page: extract simplified HTML with visibility analysis, overlay detection, and list truncation. |
| `dom_find_lists` | Find main list containers in the current page (feed, search results, tables). |
| `dom_diff` | Compare two HTML snapshots and return the changes. |
| `dom_optimize` | Optimize HTML for token efficiency: strip styles, truncate long attributes, compress data-* attributes. |
| `dom_extract_text` | Extract clean text from HTML: collapse whitespace, describe form fields. |
