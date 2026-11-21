// screen_image (docs/improvements.md): Claude asks for a screen as a picture. The Hub appends `shot.requested`; an open watch
// page renders the screen and POSTs the PNG back; the waiting tool call returns it. Pure: the broker takes its timers, so
// unit tests need no clock.
export const SHOT_WAIT_MS = 15_000;
/** Largest accepted PNG, as base64 text (about 1.1 MB of image). */
export const SHOT_B64_MAX = 1_500_000;
export const SHOT_ID_RE = /^[a-z0-9-]{8,40}$/;
const PNG_B64_PREFIX = "iVBORw0KGgo"; // base64 of the 8-byte PNG signature
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Throws a plain message unless `v` is base64 text of a PNG within the size limit; returns it. */
export function checkPng(v: unknown): string {
  if (typeof v !== "string" || v === "") throw new Error("png must be base64 text");
  if (v.length > SHOT_B64_MAX) throw new Error(`png too large: limit ${SHOT_B64_MAX} base64 characters`);
  if (!B64_RE.test(v) || !v.startsWith(PNG_B64_PREFIX)) throw new Error("png must be the base64 of a PNG image");
  return v;
}

export function checkShotId(v: unknown): string {
  if (typeof v !== "string" || !SHOT_ID_RE.test(v)) throw new Error("invalid request id");
  return v;
}

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (h: unknown) => void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Pending screenshot requests: one waiter per request id, answered at most once. */
export class ShotBroker {
  private waiting = new Map<string, { resolve: (png: string) => void; reject: (e: Error) => void; timer: unknown }>();
  private timers: Timers;
  constructor(timers: Timers = realTimers) {
    this.timers = timers;
  }

  get size(): number {
    return this.waiting.size;
  }

  /** Resolves with the PNG, or rejects after `ms` with the message that tells Claude what to do. */
  wait(id: string, ms = SHOT_WAIT_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = this.timers.set(() => {
        this.waiting.delete(id);
        reject(new Error(`no watch page answered within ${Math.round(ms / 1000)} s: open the project's watch page in a browser, then call screen_image again`));
      }, ms);
      this.waiting.set(id, { resolve, reject, timer });
    });
  }

  /** True when a waiter took the picture; false for an unknown, expired or already answered request. */
  deliver(id: string, png: string): boolean {
    const w = this.waiting.get(id);
    if (!w) return false;
    this.waiting.delete(id);
    this.timers.clear(w.timer);
    w.resolve(png);
    return true;
  }
}
