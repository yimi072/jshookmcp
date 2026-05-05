/**
 * TMWebDriverClient — TypeScript port of agent-browser-mcp's TMWebDriver.
 *
 * Connects to the Chrome extension via WebSocket (and HTTP long-polling fallback),
 * manages browser tab sessions, and executes JavaScript in real Chrome pages.
 *
 * Two modes:
 *  - **local** (default): starts WS + HTTP servers that the extension connects to.
 *  - **remote**: forwards commands to an already-running TMWebDriver instance.
 */

import { EventEmitter } from 'node:events';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer, createConnection, type Socket } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '@utils/logger';
import type {
  TMWebDriverConfig,
  TMWSession,
  SessionInfo,
  SessionType,
  CompactSession,
  ExecuteJsResult,
  PendingCommand,
} from './types';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 18765;
const STALE_SESSION_TTL_MS = 600_000; // 10 min
const HTTP_POLL_TIMEOUT_MS = 5_000;

export class TMWebDriverClient extends EventEmitter {
  readonly host: string;
  readonly port: number;
  isRemote: boolean;

  private sessions = new Map<string, TMWSession>();
  private results = new Map<string, ExecuteJsResult & { success: boolean }>();
  private acks = new Set<string>();
  private pending = new Map<string, PendingCommand>();

  private ws: WebSocket | null = null;
  private httpServer: HttpServer | null = null;

  private _defaultSessionId: string | null = null;
  private _latestSessionId: string | null = null;
  private _started = false;

  // ── HTTP long-poll queues (for extension HTTP fallback) ──
  private httpQueues = new Map<
    string,
    { queue: string[]; waiting: Array<(msg: string) => void> }
  >();

  constructor(config: TMWebDriverConfig = {}) {
    super();
    this.host = config.host ?? DEFAULT_HOST;
    this.port = config.port ?? DEFAULT_PORT;

    if (config.remoteUrl) {
      this.isRemote = true;
      this.remoteUrl = config.remoteUrl;
    } else {
      this.isRemote = false;
      this.remoteUrl = `http://${this.host}:${this.port + 1}/link`;
    }
  }

  private remoteUrl: string;

  // ── Public API ──

  get defaultSessionId(): string | null {
    return this._defaultSessionId;
  }

  set defaultSessionId(id: string | null) {
    this._defaultSessionId = id;
  }

  get latestSessionId(): string | null {
    return this._latestSessionId;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN || this.isRemote;
  }

  /**
   * Start servers (local mode) or verify remote connectivity.
   * Safe to call multiple times.
   */
  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    if (this.isRemote) {
      logger.info(`[tmwebdriver] Remote mode → ${this.remoteUrl}`);
      return;
    }

    // Check if another TMWebDriver is already listening
    const alreadyListening = await this.isPortOpen(this.port + 1);
    if (alreadyListening) {
      logger.info('[tmwebdriver] Another TMWebDriver detected, switching to remote mode');
      this.isRemote = true;
      return;
    }

    this.startHttpServer();
    this.startWsServer();
    logger.info(
      `[tmwebdriver] Listening on ws://${this.host}:${this.port} (HTTP ${this.port + 1})`,
    );
  }

  /**
   * Gracefully shut down servers and connections.
   */
  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    if (this.netServer) {
      this.netServer.close();
      this.netServer = null;
    }
    // Reject all pending commands
    for (const [, cmd] of this.pending) {
      clearTimeout(cmd.timeout);
      cmd.reject(new Error('TMWebDriverClient shutting down'));
    }
    this.pending.clear();
    this.sessions.clear();
    this._started = false;
  }

  /**
   * List all active sessions.
   */
  getSessions(): CompactSession[] {
    this.cleanStaleSessions();
    return this.compactSessions();
  }

  /**
   * Find sessions whose URL contains `urlPattern`.
   */
  findSessions(urlPattern: string): CompactSession[] {
    return this.getSessions().filter((s) => s.url.includes(urlPattern));
  }

  /**
   * Set the default session by id or URL pattern.
   * Returns the session id, or null if not found.
   */
  setSession(idOrUrlPattern: string): string | null {
    // Try exact id match first
    const byId = this.sessions.get(idOrUrlPattern);
    if (byId && byId.disconnectAt === null) {
      this._defaultSessionId = byId.id;
      return byId.id;
    }
    // Try URL pattern
    const match = this.findSessions(idOrUrlPattern);
    if (match.length > 0) {
      this._defaultSessionId = match[0]!.id;
      return match[0]!.id;
    }
    return null;
  }

  /**
   * Execute JavaScript in a browser tab.
   */
  async executeJs(
    code: string,
    options: { timeout?: number; sessionId?: string } = {},
  ): Promise<ExecuteJsResult> {
    const timeout = options.timeout ?? 15_000;
    const sessionId = options.sessionId ?? this._defaultSessionId;

    if (this.isRemote) {
      return this.remoteExecuteJs(code, sessionId, timeout);
    }

    if (!sessionId) {
      throw new Error('No active session. Open a page in Chrome with the TMWD extension loaded.');
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.disconnectAt !== null) {
      // Wait briefly for reconnection
      await this.sleep(3_000);
      const retried = this.sessions.get(sessionId);
      if (!retried || retried.disconnectAt !== null) {
        // Fallback to any active session
        const fallback = this.findActiveSession();
        if (fallback) {
          logger.warn(
            `[tmwebdriver] Session ${sessionId} disconnected, falling back to ${fallback.id}`,
          );
          this._defaultSessionId = fallback.id;
          return this.executeJs(code, { timeout, sessionId: fallback.id });
        }
        throw new Error(`Session ${sessionId} is not connected`);
      }
    }

    const activeSession = this.sessions.get(sessionId)!;
    const execId = randomUUID();
    const payload: Record<string, unknown> = { id: execId, code };
    if (activeSession.type === 'ext_ws') {
      payload.tabId = Number(sessionId);
    }

    const payloadStr = JSON.stringify(payload);

    // Send via WS or HTTP queue
    if (activeSession.type === 'ws' || activeSession.type === 'ext_ws') {
      this.ws?.send(payloadStr);
    } else if (activeSession.type === 'http') {
      this.enqueueHttp(sessionId, payloadStr);
    }

    // Wait for result with ACK tracking
    return this.waitForResult(execId, sessionId, timeout, activeSession.type);
  }

  /**
   * Navigate the current tab to a URL.
   */
  async jump(
    url: string,
    options?: { timeout?: number; sessionId?: string },
  ): Promise<ExecuteJsResult> {
    return this.executeJs(`window.location.href='${url}'`, options);
  }

  /**
   * Open a URL in a new tab.
   */
  async newTab(url: string, options?: { sessionId?: string }): Promise<ExecuteJsResult> {
    return this.executeJs(`window.open('${url}', '_blank')`, options);
  }

  // ── Remote mode ──

  private async remoteExecuteJs(
    code: string,
    sessionId: string | null,
    timeout: number,
  ): Promise<ExecuteJsResult> {
    const body = {
      cmd: 'execute_js',
      sessionId: sessionId ?? '',
      code,
      timeout: String(timeout / 1000),
    };
    const resp = await this.remotePost(body);
    const result = (resp.r ?? {}) as Record<string, unknown>;
    if (result.error) throw new Error(String(result.error));
    return result as unknown as ExecuteJsResult;
  }

  private async remotePost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const resp = await fetch(this.remoteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await resp.json()) as Record<string, unknown>;
  }

  // ── WebSocket server (extension connects to us) ──

  private netServer: import('node:net').Server | null = null;

  private startWsServer(): void {
    const server = createNetServer((socket: Socket) => {
      this.handleRawTcp(socket);
    });
    server.listen(this.port, this.host, () => {
      logger.info(`[tmwebdriver] WS server listening on ws://${this.host}:${this.port}`);
    });
    this.netServer = server;
  }

  private handleRawTcp(socket: Socket): void {
    let buffer = Buffer.alloc(0);
    let upgraded = false;
    let wsSessionId: string | null = null;

    socket.on('data', (chunk: Buffer) => {
      if (upgraded) {
        this.handleWsFrame(socket, chunk, (msg) => {
          this.handleWsMessage(msg, (id) => {
            wsSessionId = id;
          });
        });
        return;
      }

      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headers = buffer.slice(0, headerEnd).toString('utf-8');
      buffer = buffer.slice(headerEnd + 4);

      // WebSocket upgrade
      const keyMatch = headers.match(/Sec-WebSocket-Key:\s*(\S+)/i);
      if (keyMatch) {
        const key = keyMatch[1]!;
        const accept = this.wsAcceptKey(key);
        const response =
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`;
        socket.write(response);
        upgraded = true;

        // Handle any leftover data as WS frames
        if (buffer.length > 0) {
          this.handleWsFrame(socket, buffer, (msg) => {
            this.handleWsMessage(msg, (id) => {
              wsSessionId = id;
            });
          });
          buffer = Buffer.alloc(0);
        }
      }
    });

    socket.on('close', () => {
      if (wsSessionId) {
        const session = this.sessions.get(wsSessionId);
        if (session) session.disconnectAt = Date.now();
        this.emit('session:disconnect', wsSessionId);
      }
    });

    socket.on('error', (err) => {
      logger.debug(`[tmwebdriver] Socket error: ${err.message}`);
    });
  }

  private wsAcceptKey(key: string): string {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return createHash('sha1')
      .update(key + GUID)
      .digest('base64');
  }

  private handleWsFrame(socket: Socket, data: Buffer, onMessage: (msg: string) => void): void {
    // Minimal WS frame parser — handles text frames and close/ping
    let offset = 0;
    while (offset < data.length) {
      if (data.length - offset < 2) break;

      const firstByte = data[offset]!;
      const secondByte = data[offset + 1]!;
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7f;
      let headerSize = 2;

      if (payloadLen === 126) {
        if (data.length - offset < 4) break;
        payloadLen = (data[offset + 2]! << 8) | data[offset + 3]!;
        headerSize = 4;
      } else if (payloadLen === 127) {
        if (data.length - offset < 10) break;
        payloadLen = 0;
        for (let i = 0; i < 8; i++) {
          payloadLen = payloadLen * 256 + data[offset + 2 + i]!;
        }
        headerSize = 10;
      }

      const maskSize = masked ? 4 : 0;
      const totalSize = headerSize + maskSize + payloadLen;
      if (data.length - offset < totalSize) break;

      let payload = data.slice(offset + headerSize + maskSize, offset + totalSize);
      if (masked) {
        const mask = data.slice(offset + headerSize, offset + headerSize + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) {
          payload[i] = payload[i]! ^ mask[i % 4]!;
        }
      }

      if (opcode === 0x01) {
        // Text frame
        onMessage(payload.toString('utf-8'));
      } else if (opcode === 0x08) {
        // Close
        socket.end();
        return;
      } else if (opcode === 0x09) {
        // Ping → send pong
        this.wsSendFrame(socket, 0x0a, payload);
      }

      offset += totalSize;
    }
  }

  private wsSendFrame(socket: Socket, opcode: number, payload: Buffer | string): void {
    const data = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload;
    const header = Buffer.alloc(2 + (data.length > 65535 ? 8 : data.length > 125 ? 2 : 0));
    header[0] = 0x80 | opcode; // FIN + opcode

    let offset: number;
    if (data.length > 65535) {
      header[1] = 127;
      let len = data.length;
      for (let i = 9; i >= 2; i--) {
        header[i] = len & 0xff;
        len = Math.floor(len / 256);
      }
      offset = 10;
    } else if (data.length > 125) {
      header[1] = 126;
      header[2] = (data.length >> 8) & 0xff;
      header[3] = data.length & 0xff;
      offset = 4;
    } else {
      header[1] = data.length;
      offset = 2;
    }

    socket.write(Buffer.concat([header.slice(0, offset), data]));
  }

  private handleWsMessage(raw: string, registerSession: (id: string) => void): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      logger.debug(`[tmwebdriver] Non-JSON WS message: ${raw.slice(0, 100)}`);
      return;
    }

    const type = data.type as string | undefined;

    if (type === 'ready') {
      // Content script connected
      const sessionId = String(data.sessionId ?? '');
      const info: SessionInfo = {
        url: String(data.url ?? ''),
        title: String(data.title ?? ''),
        type: 'ws',
      };
      this.registerSession(sessionId, info, null);
      registerSession(sessionId);
      this.emit('session:connect', sessionId);
      return;
    }

    if (type === 'ext_ready' || type === 'tabs_update') {
      // Extension background sent tab list
      const tabs = (data.tabs ?? []) as Array<{ id: string | number; url: string; title: string }>;
      const currentIds = new Set(tabs.map((t) => String(t.id)));

      // Mark disconnected sessions
      for (const [sid, session] of this.sessions) {
        if (session.type === 'ext_ws' && !currentIds.has(sid)) {
          session.disconnectAt = Date.now();
        }
      }

      // Register/update tabs
      for (const tab of tabs) {
        const sid = String(tab.id);
        const info: SessionInfo = {
          url: tab.url ?? '',
          title: tab.title ?? '',
          type: 'ext_ws',
        };
        const existing = this.sessions.get(sid);
        if (existing && existing.disconnectAt === null) {
          existing.info = info;
        } else {
          this.registerSession(sid, info, null);
          registerSession(sid);
        }
      }

      this.emit('tabs:update', tabs);
      return;
    }

    if (type === 'ack') {
      const id = String(data.id ?? '');
      this.acks.add(id);
      const cmd = this.pending.get(id);
      if (cmd) cmd.acked = true;
      return;
    }

    if (type === 'result') {
      const id = String(data.id ?? '');
      this.results.set(id, {
        success: true,
        data: data.result,
        newTabs: (data.newTabs as ExecuteJsResult['newTabs']) ?? [],
      });
      this.resolvePending(id);
      return;
    }

    if (type === 'error') {
      const id = String(data.id ?? '');
      this.results.set(id, {
        success: false,
        data: data.error,
        newTabs: (data.newTabs as ExecuteJsResult['newTabs']) ?? [],
      });
      this.resolvePending(id);
      return;
    }

    if (type === 'ping') {
      // Extension keepalive — no action needed
      return;
    }
  }

  private resolvePending(id: string): void {
    const cmd = this.pending.get(id);
    if (!cmd) return;
    this.pending.delete(id);
    clearTimeout(cmd.timeout);

    const result = this.results.get(id);
    this.results.delete(id);
    this.acks.delete(id);

    if (!result) {
      cmd.reject(new Error('No result received'));
      return;
    }

    if (!result.success) {
      const errData = result.data;
      const msg =
        typeof errData === 'object' && errData !== null && 'message' in errData
          ? String((errData as Record<string, unknown>).message)
          : String(errData);
      cmd.reject(new Error(msg));
      return;
    }

    cmd.resolve({
      data: result.data,
      newTabs: result.newTabs,
    });
  }

  // ── HTTP server (long-polling fallback for extension) ──

  private startHttpServer(): void {
    const server = createHttpServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/result') {
        this.handleHttpResult(req, res);
      } else if (req.method === 'POST' && req.url === '/api/longpoll') {
        this.handleHttpLongPoll(req, res);
      } else if (req.method === 'POST' && req.url === '/link') {
        this.handleHttpLink(req, res);
      } else {
        res.writeHead(200);
        res.end('ok');
      }
    });
    server.listen(this.port + 1, this.host);
    this.httpServer = server;
  }

  private handleHttpResult(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req).then((body) => {
      try {
        const data = JSON.parse(body) as Record<string, unknown>;
        const id = String(data.id ?? '');
        if (data.type === 'result') {
          this.results.set(id, {
            success: true,
            data: data.result,
            newTabs: (data.newTabs as ExecuteJsResult['newTabs']) ?? [],
          });
        } else if (data.type === 'error') {
          this.results.set(id, {
            success: false,
            data: data.error,
            newTabs: (data.newTabs as ExecuteJsResult['newTabs']) ?? [],
          });
        }
        this.resolvePending(id);
      } catch {
        /* ignore parse errors */
      }
      res.writeHead(200);
      res.end('ok');
    });
  }

  private handleHttpLongPoll(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req).then((body) => {
      try {
        const data = JSON.parse(body) as Record<string, unknown>;
        const sessionId = String(data.sessionId ?? '');
        const info: SessionInfo = {
          url: String(data.url ?? ''),
          title: String(data.title ?? ''),
          type: 'http',
        };

        if (!this.sessions.has(sessionId)) {
          this.registerSession(sessionId, info, null);
        }

        const session = this.sessions.get(sessionId)!;
        session.disconnectAt = null;

        if (session.type !== 'http') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: '', ret: 'use ws' }));
          return;
        }

        // Wait for a message in the queue or timeout
        const queue = this.getHttpQueue(sessionId);
        const deadline = Date.now() + HTTP_POLL_TIMEOUT_MS;

        const tryDequeue = (): void => {
          if (queue.queue.length > 0) {
            const msg = queue.queue.shift()!;
            // Track ACK
            try {
              const parsed = JSON.parse(msg) as Record<string, unknown>;
              if (parsed.id) this.acks.add(String(parsed.id));
            } catch {
              /* ignore */
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(msg);
            return;
          }
          if (Date.now() >= deadline) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: '', ret: 'next long-poll' }));
            return;
          }
          // Register waiter
          const waiter = (msg: string): void => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(msg);
          };
          queue.waiting.push(waiter);
          // Cleanup on timeout
          setTimeout(
            () => {
              const idx = queue.waiting.indexOf(waiter);
              if (idx !== -1) {
                queue.waiting.splice(idx, 1);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: '', ret: 'next long-poll' }));
              }
            },
            Math.max(0, deadline - Date.now()),
          );
        };

        tryDequeue();
      } catch {
        res.writeHead(400);
        res.end('bad request');
      }
    });
  }

  private handleHttpLink(req: IncomingMessage, res: ServerResponse): void {
    this.readBody(req).then((body) => {
      try {
        const data = JSON.parse(body) as Record<string, unknown>;
        const cmd = data.cmd as string | undefined;

        if (cmd === 'get_all_sessions') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ r: this.getSessions() }));
          return;
        }

        if (cmd === 'find_session') {
          const pattern = String(data.url_pattern ?? '');
          const matched = this.getSessions().filter((s) => s.url.includes(pattern));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ r: matched }));
          return;
        }

        if (cmd === 'execute_js') {
          const sessionId = String(data.sessionId ?? this._defaultSessionId ?? '');
          const code = String(data.code ?? '');
          const timeout = Number(data.timeout ?? 10) * 1000;
          this.executeJs(code, { sessionId, timeout })
            .then((result) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ r: result }));
            })
            .catch((err: Error) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ r: { error: err.message } }));
            });
          return;
        }
      } catch {
        /* ignore */
      }
      res.writeHead(200);
      res.end('ok');
    });
  }

  // ── Helpers ──

  private registerSession(sessionId: string, info: SessionInfo, _client: unknown): void {
    const isNew = !this.sessions.has(sessionId);
    const now = Date.now();

    if (isNew) {
      const session: TMWSession = {
        id: sessionId,
        info,
        connectAt: now,
        disconnectAt: null,
        type: info.type ?? 'ws',
      };
      this.sessions.set(sessionId, session);
      logger.info(`[tmwebdriver] Tab connected: ${info.url} (${sessionId})`);
    } else {
      const session = this.sessions.get(sessionId)!;
      session.info = info;
      session.type = info.type ?? session.type;
      session.connectAt = now;
      session.disconnectAt = null;
      logger.info(`[tmwebdriver] Tab reconnected: ${info.url} (${sessionId})`);
    }

    this._latestSessionId = sessionId;
    if (!this._defaultSessionId) {
      this._defaultSessionId = sessionId;
    }
  }

  private waitForResult(
    execId: string,
    _sessionId: string,
    timeout: number,
    _sessionType: SessionType,
  ): Promise<ExecuteJsResult> {
    return new Promise<ExecuteJsResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(execId);
        this.results.delete(execId);
        this.acks.delete(execId);

        const acked = this.acks.has(execId);
        if (acked) {
          resolve({
            result: `No response in ${timeout / 1000}s (ACK received, script may still be running)`,
          });
        } else {
          resolve({
            result: `No response in ${timeout / 1000}s (no ACK, script may not have been delivered)`,
          });
        }
      }, timeout);

      this.pending.set(execId, {
        id: execId,
        resolve,
        reject,
        timeout: timer,
        acked: false,
      });

      // Check for immediate result (e.g. from HTTP callback)
      if (this.results.has(execId)) {
        this.resolvePending(execId);
      }
    });
  }

  private findActiveSession(): TMWSession | null {
    for (const session of this.sessions.values()) {
      if (session.disconnectAt === null) return session;
    }
    return null;
  }

  private compactSessions(): CompactSession[] {
    const result: CompactSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.disconnectAt !== null) continue;
      result.push({
        id: session.id,
        url: session.info.url,
        title: session.info.title,
      });
    }
    return result;
  }

  private cleanStaleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.disconnectAt !== null && now - session.disconnectAt > STALE_SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  private getHttpQueue(sessionId: string): {
    queue: string[];
    waiting: Array<(msg: string) => void>;
  } {
    let q = this.httpQueues.get(sessionId);
    if (!q) {
      q = { queue: [], waiting: [] };
      this.httpQueues.set(sessionId, q);
    }
    return q;
  }

  private enqueueHttp(sessionId: string, message: string): void {
    const q = this.getHttpQueue(sessionId);
    if (q.waiting.length > 0) {
      const waiter = q.waiting.shift()!;
      waiter(message);
    } else {
      q.queue.push(message);
    }
  }

  private async isPortOpen(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: this.host, port, timeout: 1000 }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
