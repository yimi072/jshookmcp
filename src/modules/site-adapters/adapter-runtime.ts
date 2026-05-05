/**
 * Site adapter runtime — loads, parses, and executes bb-sites compatible adapters.
 *
 * Adapter format (compatible with epiral/bb-sites):
 *   // @meta { "name": "reddit/me", "description": "...", "domain": "www.reddit.com", "args": {} }
 *   async function(args) { ... return structuredData; }
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getProjectRoot } from '@utils/outputPaths';
import type {
  AdapterMeta,
  AdapterFile,
  AdapterEntry,
  AdapterIndex,
  AdapterResult,
} from './types';

const ADAPTERS_DIR = join(getProjectRoot(), 'src', 'assets', 'bb-sites');
const USER_ADAPTERS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.jshookmcp',
  'adapters',
);

let cachedIndex: AdapterIndex | null = null;

/**
 * Parse @meta JSON block from adapter JS source.
 */
export function parseAdapterMeta(code: string): AdapterMeta | null {
  const match = code.match(/\/\*\s*@meta\s*(\{[\s\S]*?\})\s*\*\//);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as AdapterMeta;
  } catch {
    return null;
  }
}

/**
 * Load a single adapter file.
 */
export function loadAdapter(filePath: string): AdapterFile | null {
  try {
    const code = readFileSync(filePath, 'utf8');
    const meta = parseAdapterMeta(code);
    if (!meta) return null;
    return { meta, code, source: filePath };
  } catch {
    return null;
  }
}

/**
 * Scan a directory for adapter JS files and build an index.
 */
function scanAdaptersDir(dir: string, index: AdapterIndex): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanAdaptersDir(full, index);
    } else if (entry.name.endsWith('.js')) {
      const code = readFileSync(full, 'utf8');
      const meta = parseAdapterMeta(code);
      if (meta?.name) {
        const relPath = relative(ADAPTERS_DIR, full).split(sep).join('/');
        index[meta.name] = {
          file: relPath,
          description: meta.description || '',
          domain: meta.domain || '',
          readOnly: meta.readOnly !== false,
          args: meta.args || {},
          capabilities: meta.capabilities || [],
        };
      }
    }
  }
}

/**
 * Get the full adapter index (bundled + user).
 */
export function getAdapterIndex(): AdapterIndex {
  if (cachedIndex) return cachedIndex;
  cachedIndex = {};

  // Try bundled index.json first
  const indexJsonPath = join(ADAPTERS_DIR, 'index.json');
  if (existsSync(indexJsonPath)) {
    try {
      const raw = readFileSync(indexJsonPath, 'utf8');
      Object.assign(cachedIndex, JSON.parse(raw));
    } catch {
      // fallback to scanning
    }
  }

  // Scan user adapters (override bundled)
  scanAdaptersDir(USER_ADAPTERS_DIR, cachedIndex);

  return cachedIndex;
}

/**
 * Invalidate the cached index (e.g., after installing new adapters).
 */
export function invalidateAdapterIndex(): void {
  cachedIndex = null;
}

/**
 * Resolve adapter name to file path.
 */
export function resolveAdapter(name: string): AdapterFile | null {
  const index = getAdapterIndex();
  const entry = index[name];
  if (!entry) return null;

  // Try user dir first, then bundled
  const userPath = join(USER_ADAPTERS_DIR, entry.file);
  if (existsSync(userPath)) return loadAdapter(userPath);

  const bundledPath = join(ADAPTERS_DIR, entry.file);
  if (existsSync(bundledPath)) return loadAdapter(bundledPath);

  return null;
}

/**
 * Search adapters by keyword (name, description, domain).
 */
export function searchAdapters(query: string): Array<{ name: string } & AdapterEntry> {
  const q = query.toLowerCase();
  const index = getAdapterIndex();
  const results: Array<{ name: string } & AdapterEntry> = [];
  for (const [name, entry] of Object.entries(index)) {
    if (
      name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.domain.toLowerCase().includes(q)
    ) {
      results.push({ name, ...entry });
    }
  }
  return results;
}

/**
 * Wrap adapter code for injection into browser context.
 * The adapter is an async function that receives args and returns data.
 */
function wrapAdapterCode(adapterCode: string, args: Record<string, unknown>): string {
  // The adapter code is: /* @meta ... */ async function(args) { ... }
  // We need to extract just the function and call it
  return `(async () => {
    const __adapter = ${adapterCode};
    const __args = ${JSON.stringify(args)};
    return await __adapter(__args);
  })()`;
}

/**
 * Execute an adapter via executeJs function.
 */
export async function executeAdapter(
  name: string,
  args: Record<string, unknown>,
  executeJsFn: (code: string) => Promise<unknown>,
): Promise<AdapterResult> {
  const start = Date.now();
  const adapter = resolveAdapter(name);

  if (!adapter) {
    return {
      success: false,
      error: `Adapter "${name}" not found`,
      hint: 'Run site_list to see available adapters',
      adapter: name,
      elapsedMs: Date.now() - start,
    };
  }

  try {
    const wrappedCode = wrapAdapterCode(adapter.code, args);
    const rawResult = await executeJsFn(wrappedCode);

    // The result may come as { data: ... } from TMWebDriver or directly
    const data =
      rawResult && typeof rawResult === 'object' && 'data' in (rawResult as Record<string, unknown>)
        ? (rawResult as Record<string, unknown>).data
        : rawResult;

    // Check if the adapter returned an error
    if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
      const errObj = data as Record<string, unknown>;
      return {
        success: false,
        error: String(errObj.error),
        hint: errObj.hint ? String(errObj.hint) : undefined,
        adapter: name,
        elapsedMs: Date.now() - start,
      };
    }

    return {
      success: true,
      data,
      adapter: name,
      elapsedMs: Date.now() - start,
    };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
      adapter: name,
      elapsedMs: Date.now() - start,
    };
  }
}
