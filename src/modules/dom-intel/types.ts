/** Options for page scanning. */
export interface ScanOptions {
  /** Text-only mode (returns plain text with block-level newlines). */
  textOnly?: boolean;
  /** Enable list detection and truncation. */
  cutlist?: boolean;
  /** Max characters before smart truncation. */
  maxChars?: number;
  /** Instruction hint for list item matching (e.g. a keyword to keep). */
  instruction?: string;
  /** Extra JS to inject before scanning. */
  extraJs?: string;
}

/** A discovered list container. */
export interface ListCandidate {
  containerTag: string;
  containerId: string;
  containerClass: string;
  selector: string;
  itemCount: number;
  score: number;
  firstItemPreview?: string;
  itemTags?: string[];
}

/** DOM diff result. */
export interface DomDiffResult {
  changed: number;
  topChange?: string;
}

/** Token optimization stats. */
export interface OptimizeStats {
  originalLength: number;
  optimizedLength: number;
  savedPercent: number;
}
