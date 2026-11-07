// Page sessions (docs/auth.md): a signed cookie, no server state. `exp.hmac`, where hmac = HMAC-SHA256(password, "lite-session:" + exp),
// so changing the password signs every session out. Pure but for Web Crypto, which Workers and Node both have.
import { safeEqual } from "./auth.ts";

export const SESSION_COOKIE = "lite_session";
export const SESSION_SECONDS = 30 * 24 * 3600;
/** The Worker sets this on a websocket upgrade whose session cookie it verified, and strips any value a client sent. */
export const SESSION_HEADER = "X-Lite-Session";
const enc = new TextEncoder();

async function mac(secret: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`lite-session:${exp}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value of a session that ends at `exp` (seconds since 1970). */
export async function signSession(secret: string, exp: number): Promise<string> {
  return `${exp}.${await mac(secret, exp)}`;
}

/** True for a well-formed, unexpired value signed with this secret. Without a secret no session is valid. */
export async function verifySession(secret: string | undefined, value: string | undefined, nowMs = Date.now()): Promise<boolean> {
  const m = secret && value ? /^(\d{1,12})\.([0-9a-f]{64})$/.exec(value) : null;
  if (!m || !secret) return false;
  const exp = Number(m[1]);
  return exp > Math.floor(nowMs / 1000) && safeEqual(m[2], await mac(secret, exp));
}

/** One cookie's value from a `Cookie` header. */
export function cookieValue(header: string | null, name = SESSION_COOKIE): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** The Set-Cookie header: HttpOnly, SameSite=Strict, Secure on https. maxAge 0 clears it. */
export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** True when the request carries a valid session cookie. */
export const sessionOk = (request: Request, password: string | undefined, nowMs = Date.now()): Promise<boolean> =>
  verifySession(password, cookieValue(request.headers.get("Cookie")), nowMs);
