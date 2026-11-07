// Secrets set with `wrangler secret put` are not in the generated Env; this merges into it.
interface Env {
  /** Bearer token for /mcp and /events. Unset only in local dev, which then runs open. */
  LITE_TOKEN?: string;
  /** The page password (docs/auth.md). Unset: the page is opened with the token as before and there is no login. */
  LITE_PASSWORD?: string;
}
