// Reconnecting, read-only event client. The WebSocket constructor and timers are injected so it runs without a network.
import type { WatchRow } from "./format.ts";

export const DEFAULT_URL = "ws://127.0.0.1:8790/events";
export const BACKOFF_START_MS = 500;
export const BACKOFF_MAX_MS = 10_000;

/** ws(s):// kept; http(s):// converted; /events appended when there is no path. */
export function normalizeUrl(input: string | undefined): string {
  const raw = input?.trim() || DEFAULT_URL;
  const u = new URL(raw);
  if (u.protocol === "http:") u.protocol = "ws:";
  else if (u.protocol === "https:") u.protocol = "wss:";
  else if (u.protocol !== "ws:" && u.protocol !== "wss:") throw new Error(`unsupported URL scheme: ${u.protocol}`);
  if (u.pathname === "/" || u.pathname === "") u.pathname = "/events";
  return u.toString();
}

/** Delay before reconnect attempt number `attempt` (0-based): 500 ms doubling to 10 s. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_MAX_MS);
}

/** True when the row is new; rows at or below the last seen seq are duplicates. */
export const isNew = (seq: number, lastSeq: number) => seq > lastSeq;

export type SocketLike = {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

export type WatcherOptions = {
  url: string;
  token?: string;
  after?: number;
  WebSocket: new (url: string) => SocketLike;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onRow: (row: WatchRow) => void;
  onStatus: (line: string) => void;
  /** Called once when the server refuses us (close code 1008). The watcher stops. */
  onRefused: () => void;
};

export class Watcher {
  lastSeq: number;
  skipped = 0;
  private attempt = 0;
  private socket: SocketLike | null = null;
  private timer: unknown = null;
  private stopped = false;

  private o: WatcherOptions;

  constructor(o: WatcherOptions) {
    this.o = o;
    this.lastSeq = o.after ?? 0;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.o.clearTimer(this.timer);
    this.timer = null;
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onopen = s.onmessage = s.onclose = s.onerror = null;
      try {
        s.close();
      } catch {}
    }
  }

  private connect(): void {
    this.timer = null;
    const s = new this.o.WebSocket(this.o.url);
    this.socket = s;
    s.onopen = () => {
      // The one and only message this client ever sends.
      const hello: { token?: string; after: number } = { after: this.lastSeq };
      if (this.o.token) hello.token = this.o.token;
      s.send(JSON.stringify({ hello }));
      this.o.onStatus("connected");
    };
    s.onmessage = (ev) => {
      if (this.socket !== s) return;
      let row: WatchRow;
      try {
        row = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!row || typeof row.seq !== "number") return;
      this.attempt = 0;
      if (!isNew(row.seq, this.lastSeq)) {
        this.skipped++;
        return;
      }
      this.lastSeq = row.seq;
      this.o.onRow(row);
    };
    s.onclose = (ev) => this.ended(s, ev?.code);
    s.onerror = () => this.ended(s);
  }

  private ended(s: SocketLike, code?: number): void {
    if (this.stopped || this.socket !== s) return; // already handled (error then close)
    this.socket = null;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    if (code === 1008) {
      this.stopped = true;
      this.o.onStatus("refused: check LITE_TOKEN");
      this.o.onRefused();
      return;
    }
    const ms = backoffMs(this.attempt++);
    this.o.onStatus(`disconnected, retrying in ${ms / 1000}s`);
    this.timer = this.o.setTimer(() => this.connect(), ms);
  }
}
