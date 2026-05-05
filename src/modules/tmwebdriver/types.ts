/**
 * TMWebDriver types — shared across the real-browser module.
 */

/** Session transport type reported by the Chrome extension. */
export type SessionType = 'ws' | 'ext_ws' | 'http';

/** Raw session info sent by the extension on connect/reconnect. */
export interface SessionInfo {
  url: string;
  title: string;
  type?: SessionType;
  connectedAt?: number;
}

/** A tracked browser tab session. */
export interface TMWSession {
  id: string;
  info: SessionInfo;
  connectAt: number;
  disconnectAt: number | null;
  type: SessionType;
}

/** Compact session descriptor returned to callers. */
export interface CompactSession {
  id: string;
  url: string;
  title: string;
}

/** Result of executeJs. */
export interface ExecuteJsResult {
  data?: unknown;
  result?: unknown;
  closed?: number;
  newTabs?: Array<{ id: string | number; url: string; title?: string }>;
}

/** Configuration for TMWebDriverClient. */
export interface TMWebDriverConfig {
  /** Host to connect/listen on. Default '127.0.0.1'. */
  host?: string;
  /** WebSocket port. Default 18765. HTTP port = port + 1. */
  port?: number;
  /** Connect to an existing TMWebDriver instead of starting our own. */
  remoteUrl?: string;
}

/** Internal: pending command tracking. */
export interface PendingCommand {
  id: string;
  resolve: (result: ExecuteJsResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  acked: boolean;
}
