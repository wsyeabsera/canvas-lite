// Pure logic of the login form (docs/auth.md): no DOM. login-view.ts draws it.
export type AuthInfo = { password: boolean; session: boolean };

/** `GET /api/auth` answer; null when unreadable. */
export function parseAuth(v: unknown): AuthInfo | null {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  return o && typeof o.password === "boolean" && typeof o.session === "boolean" ? { password: o.password, session: o.session } : null;
}

/** The line under the field after a failed sign-in: wrong password with the tries left, the pause, or a generic failure. */
export function loginFailure(status: number, body: unknown): string {
  const o = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 401) {
    const n = typeof o.tries_left === "number" ? o.tries_left : 0;
    return `Wrong password. ${n} ${n === 1 ? "try" : "tries"} left before a 15 minute pause.`;
  }
  if (status === 429) {
    const s = typeof o.retry_after === "number" && o.retry_after > 0 ? o.retry_after : 900;
    const m = Math.ceil(s / 60);
    return `Too many tries. Try again in ${m} minute${m === 1 ? "" : "s"}.`;
  }
  return "Could not sign in. Try again.";
}
