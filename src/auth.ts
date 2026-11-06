/** Constant-time string comparison: the time taken does not depend on where the strings first differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True when no token is configured (local dev) or the supplied one matches. */
export function tokenOk(supplied: string | undefined | null, expected: string | undefined): boolean {
  return !expected || safeEqual(supplied ?? "", expected);
}

/** The token from an `Authorization: Bearer <token>` header, or undefined. */
export function bearerToken(header: string | null): string | undefined {
  const m = /^Bearer (\S+)$/.exec(header ?? "");
  return m?.[1];
}

/** A deployed Worker with no LITE_TOKEN must refuse everything (fail closed); only localhost (wrangler dev) may run open. */
export function misconfigured(url: URL, token: string | undefined): boolean {
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return !token && !local;
}
