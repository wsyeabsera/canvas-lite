// POST /login and /logout (docs/auth.md): pure request handlers, the Worker passes the Hub's throttle in. Never logs or echoes the password.
import { json } from "./api.ts";
import { safeEqual } from "./auth.ts";
import type { Attempt } from "./login-limit.ts";
import { SESSION_SECONDS, sessionCookie, signSession } from "./session.ts";

export type Throttle = { loginCheck(key: string): Promise<Attempt>; loginFailed(key: string): Promise<Attempt>; loginOk(key: string): Promise<void> };
export const BODY_MAX = 1024;

/** A browser sends Origin on every POST: a cross-site one is refused. A request without Origin (a script) is let through; it has no ambient cookie. */
export const sameOrigin = (origin: string | null, url: URL): boolean => origin === null || origin === url.origin;

const locked = (a: Extract<Attempt, { locked: true }>) =>
  json(429, { error: "Too many tries", retry_after: a.retry_after }, { "Retry-After": String(a.retry_after) });

export async function handleLogin(request: Request, password: string | undefined, throttle: Throttle, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST") return json(405, { error: "method not allowed" }, { Allow: "POST" });
  if (!sameOrigin(request.headers.get("Origin"), url)) return json(403, { error: "cross-site request refused" });
  if (!password) return json(404, { error: "login is not enabled" });
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const before = await throttle.loginCheck(key);
  if (before.locked) return locked(before);
  const text = await request.text();
  let supplied: unknown;
  try {
    supplied = text.length <= BODY_MAX ? JSON.parse(text)?.password : undefined;
  } catch {
    /* falls through to the 400 below */
  }
  if (typeof supplied !== "string") return json(400, { error: 'expected {"password": "..."}' });
  if (!safeEqual(supplied, password)) {
    const after = await throttle.loginFailed(key);
    return after.locked ? locked(after) : json(401, { error: "Wrong password", tries_left: after.tries_left });
  }
  await throttle.loginOk(key);
  const value = await signSession(password, Math.floor(now / 1000) + SESSION_SECONDS);
  return json(200, { ok: true }, { "Set-Cookie": sessionCookie(value, SESSION_SECONDS, url.protocol === "https:") });
}

export function handleLogout(request: Request): Response {
  const url = new URL(request.url);
  if (request.method !== "POST") return json(405, { error: "method not allowed" }, { Allow: "POST" });
  if (!sameOrigin(request.headers.get("Origin"), url)) return json(403, { error: "cross-site request refused" });
  return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0, url.protocol === "https:") });
}
