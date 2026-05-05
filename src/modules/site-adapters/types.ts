/**
 * Site adapter types — compatible with bb-sites format.
 */

export interface AdapterArgDef {
  type: string;
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface AdapterMeta {
  name: string;
  description: string;
  domain: string;
  args: Record<string, AdapterArgDef>;
  capabilities?: string[];
  readOnly?: boolean;
}

export interface AdapterEntry {
  file: string;
  description: string;
  domain: string;
  readOnly: boolean;
  args: Record<string, AdapterArgDef>;
  capabilities: string[];
}

export interface AdapterFile {
  meta: AdapterMeta;
  code: string;
  source: string;
}

export interface AdapterResult {
  success: boolean;
  data?: unknown;
  error?: string;
  hint?: string;
  adapter: string;
  elapsedMs: number;
}

export type AdapterIndex = Record<string, AdapterEntry>;
