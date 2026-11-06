// Read-only JSON API for the watch page (docs/api.md). Pure: routing, auth gate and response shaping; the Worker calls the Hub.
import { bearerToken, misconfigured, tokenOk } from "./auth.ts";

export type ApiRoute =
  | { kind: "list" }
  | { kind: "read"; id: string }
  | { kind: "error"; status: 400 | 404 | 405; message: string; headers?: Record<string, string> };

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" };

/** True for any path the API owns. */
export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** Map a method and path to what the Worker should do. Does not know whether a project exists. */
export function routeApi(method: string, pathname: string): ApiRoute {
  const parts = pathname.slice("/api/".length).split("/");
  if (parts[0] !== "projects") return { kind: "error", status: 404, message: "not found" };
  if (parts.length > 2) return { kind: "error", status: 400, message: "invalid path: expected /api/projects/<id>" };
  if (method !== "GET" && method !== "HEAD") return { kind: "error", status: 405, message: "method not allowed", headers: { Allow: "GET, HEAD" } };
  if (parts.length === 1) return { kind: "list" };
  const id = parts[1];
  if (id.length > 40 || !ID_RE.test(id)) return { kind: "error", status: 400, message: `invalid project id "${id}": use lowercase letters, digits and -, at most 40` };
  return { kind: "read", id };
}

/** Same gate as /mcp: fail closed first, then the bearer token. */
export function gateApi(authHeader: string | null, token: string | undefined, url: URL): "ok" | 401 | 503 {
  if (misconfigured(url, token)) return 503;
  return tokenOk(bearerToken(authHeader), token) ? "ok" : 401;
}

/** A JSON response, never cached, with no CORS headers. */
export function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/** The error response for a failed gate. */
export function gateResponse(gate: 401 | 503): Response {
  return gate === 503
    ? json(503, { error: "server has no token configured" })
    : json(401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });
}

/** A Hub error becomes 404 when it is the unknown-project error, else 500. */
export function hubErrorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  return /^unknown project "/.test(message) ? json(404, { error: message }) : json(500, { error: "internal error" });
}
