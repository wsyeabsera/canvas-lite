// Secrets set with `wrangler secret put` are not in the generated Env; this merges into it.
interface Env {
  /** Bearer token for /mcp and /events. Unset only in local dev, which then runs open. */
  LITE_TOKEN?: string;
}
