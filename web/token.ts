/** The token from a URL fragment like `#token=abc`; never read from the query string. */
export function tokenFromHash(hash: string): string | undefined {
  const m = /^#(?:.*&)?token=([^&]+)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : undefined;
}
