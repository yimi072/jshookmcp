/**
 * Per-session ref registry — maps @ref numbers to XPath selectors.
 * Stored server-side for element interaction.
 * Persists to disk so CLI invocations can share refs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REFS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.jshookmcp',
);
const REFS_FILE = join(REFS_DIR, 'refs.json');

export class RefRegistry {
  private maps = new Map<string, Map<number, string>>();

  constructor(private persist = true) {
    if (persist) this.load();
  }

  /**
   * Store refs for a session (from snapshot result).
   */
  set(sessionId: string, refs: Record<number, string>): void {
    const map = new Map<number, string>();
    for (const [k, v] of Object.entries(refs)) {
      map.set(Number(k), v);
    }
    this.maps.set(sessionId, map);
    if (this.persist) this.save();
  }

  /**
   * Resolve a ref number to XPath.
   */
  resolve(sessionId: string, ref: number): string | null {
    return this.maps.get(sessionId)?.get(ref) ?? null;
  }

  /**
   * Clear refs for a session.
   */
  clear(sessionId: string): void {
    this.maps.delete(sessionId);
    if (this.persist) this.save();
  }

  /**
   * Get ref count for a session.
   */
  count(sessionId: string): number {
    return this.maps.get(sessionId)?.size ?? 0;
  }

  /**
   * Load refs from disk.
   */
  private load(): void {
    try {
      if (!existsSync(REFS_FILE)) return;
      const raw = readFileSync(REFS_FILE, 'utf8');
      const data = JSON.parse(raw) as Record<string, Record<string, string>>;
      for (const [sid, refs] of Object.entries(data)) {
        const map = new Map<number, string>();
        for (const [k, v] of Object.entries(refs)) {
          map.set(Number(k), v);
        }
        this.maps.set(sid, map);
      }
    } catch {
      // corrupt file, ignore
    }
  }

  /**
   * Save refs to disk.
   */
  private save(): void {
    try {
      mkdirSync(REFS_DIR, { recursive: true });
      const data: Record<string, Record<string, string>> = {};
      for (const [sid, map] of this.maps) {
        data[sid] = {};
        for (const [k, v] of map) {
          data[sid][String(k)] = v;
        }
      }
      writeFileSync(REFS_FILE, JSON.stringify(data, null, 2));
    } catch {
      // write failure, ignore
    }
  }
}

/** Singleton instance shared across handlers. */
export const refRegistry = new RefRegistry();
