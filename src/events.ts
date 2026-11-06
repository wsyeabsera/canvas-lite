// The /events protocol (docs/progress.md), as pure functions so unit tests cover it without workerd.
import { eventsAfter, type LiteEvent, type Sql } from "./store.ts";

export type Hello = { token?: string; after: number };

/** The first (and only) message a client may send: {"hello":{"token":"...","after":N}}. Null if it is anything else. */
export function parseHello(raw: unknown): Hello | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  const h = msg?.hello;
  if (!h || typeof h !== "object") return null;
  if (h.token !== undefined && typeof h.token !== "string") return null;
  if (!Number.isSafeInteger(h.after) || h.after < 0) return null;
  return { ...(h.token !== undefined && { token: h.token }), after: h.after };
}

/** Every event with seq > after, oldest first, read in pages so the replay is gapless however far behind the client is. */
export function* replay(sql: Sql, after: number, page = 1000): Generator<LiteEvent> {
  for (;;) {
    const rows = eventsAfter(sql, after, page);
    yield* rows;
    if (rows.length < page) return;
    after = rows[rows.length - 1].seq;
  }
}
