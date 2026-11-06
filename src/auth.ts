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
