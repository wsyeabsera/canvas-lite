// Sign-in throttle (docs/auth.md): at most MAX_FAILS wrong passwords per key (the connection's IP) in WINDOW_S seconds, then a pause until the
// window ends. Pure functions over `Sql`; the table is `login_attempts`.
import type { Sql } from "./store.ts";

export const MAX_FAILS = 5;
export const WINDOW_S = 15 * 60;

export type Attempt = { locked: false; tries_left: number } | { locked: true; retry_after: number };

type Row = { count: number; first_at: number };

function current(sql: Sql, key: string, now: number): Row | null {
  const [r] = sql.all<Row>("SELECT count, first_at FROM login_attempts WHERE key = ?", key);
  return r && now - r.first_at < WINDOW_S * 1000 ? r : null;
}

const state = (r: Row | null, now: number): Attempt =>
  r && r.count >= MAX_FAILS ? { locked: true, retry_after: Math.ceil((r.first_at + WINDOW_S * 1000 - now) / 1000) } : { locked: false, tries_left: MAX_FAILS - (r?.count ?? 0) };

/** Whether this key may try now. */
export const checkLogin = (sql: Sql, key: string, now = Date.now()): Attempt => state(current(sql, key, now), now);

/** Counts a wrong password and returns the new state. Old rows are dropped on the way. */
export function recordFailure(sql: Sql, key: string, now = Date.now()): Attempt {
  return sql.transaction(() => {
    sql.run("DELETE FROM login_attempts WHERE first_at <= ?", now - WINDOW_S * 1000);
    const r = current(sql, key, now);
    const next = { count: (r?.count ?? 0) + 1, first_at: r?.first_at ?? now };
    sql.run("INSERT INTO login_attempts (key, count, first_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET count = excluded.count, first_at = excluded.first_at", key, next.count, next.first_at);
    return state(next, now);
  });
}

/** A right password forgets earlier failures. */
export function clearFailures(sql: Sql, key: string): void {
  sql.run("DELETE FROM login_attempts WHERE key = ?", key);
}
