import { gateApi, gateResponse, hubErrorResponse, isApiPath, json, routeApi } from "./api.ts";
import { handleLogin, handleLogout, sameOrigin } from "./login.ts";
import { SESSION_HEADER, sessionOk } from "./session.ts";
import { bearerToken, misconfigured, tokenOk } from "./auth.ts";
import { siteDecision } from "./site-gate.ts";
import { hub } from "./hub.ts";
import { mcpHandler } from "./mcp.ts";

export { Hub } from "./hub.ts";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "GET" && pathname === "/health") return Response.json({ status: "ok" });
    if (pathname === "/mcp" || pathname === "/events") {
      if (misconfigured(url, env.LITE_TOKEN)) return new Response("server has no token configured", { status: 503 });
      // /events authenticates with its first websocket message (docs/progress.md), so browsers need no header.
      if (pathname === "/events") {
        // A valid page session counts as the watcher's credential: the Worker vouches for it in a header it alone sets.
        const headers = new Headers(request.headers);
        headers.delete(SESSION_HEADER);
        if (await sessionOk(request, env.LITE_PASSWORD)) headers.set(SESSION_HEADER, "1");
        return hub(env).fetch(new Request(request, { headers }));
      }
      if (!tokenOk(bearerToken(request.headers.get("Authorization")), env.LITE_TOKEN))
        return new Response("unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
      return mcpHandler(request, env, ctx);
    }
    if (pathname === "/login" && request.method !== "GET" && request.method !== "HEAD") return handleLogin(request, env.LITE_PASSWORD, hub(env));
    if (pathname === "/logout") return handleLogout(request);
    if (request.method === "GET" && pathname === "/api/auth") {
      // What the page needs to choose between its token message and a login form; reveals nothing secret.
      return json(200, { password: Boolean(env.LITE_PASSWORD), session: await sessionOk(request, env.LITE_PASSWORD) });
    }
    if (isApiPath(pathname)) {
      let gate = gateApi(request.headers.get("Authorization"), env.LITE_TOKEN, url);
      if (gate === 401 && (await sessionOk(request, env.LITE_PASSWORD))) gate = "ok"; // a page session is as good as the token here
      if (gate !== "ok") return gateResponse(gate);
      if (request.method === "POST" && !sameOrigin(request.headers.get("Origin"), url)) return json(403, { error: "cross-site request refused" });
      const route = routeApi(request.method, pathname);
      if (route.kind === "error") return json(route.status, { error: route.message }, route.headers);
      try {
        const h = hub(env);
        if (route.kind === "list") return json(200, await h.listProjects());
        if (route.kind === "read") return json(200, await h.readProject(route.id, true));
        if (route.kind === "canvases") return json(200, await h.listCanvasesForPage(route.id));
        if (route.kind === "scenes") return json(200, await h.listScenes(route.id));
        if (route.kind === "scene") return json(200, await h.readScene(route.id, route.scene));
        if (route.kind === "design") return json(200, await h.getDesignSystem(route.id));
        if (route.kind === "variants") return json(200, await h.listVariants(route.id, route.canvas));
        if (route.kind === "tournament") return json(200, await h.tournamentResults(route.id, route.tournament));
        if (route.kind === "walk") return json(200, await h.readWalkForPage(route.id, route.walk));
        if (route.kind === "fork") {
          const text = await request.text();
          let body: { name?: unknown; seq?: unknown } = {};
          try {
            body = text.length <= 1024 ? JSON.parse(text) : {};
          } catch {
            /* a bad body is a 400 below */
          }
          if (typeof body !== "object" || body === null || typeof body.name !== "string") return json(400, { error: 'invalid body: expected {"name": "...", "seq"?: number}' });
          return json(200, await h.forkCanvas(route.id, { canvas: route.canvas, name: body.name, ...(typeof body.seq === "number" && { seq: body.seq }) }));
        }
        if (route.kind === "admin-overview") return json(200, await h.adminOverview());
        if (route.kind === "archive") return json(200, await h.archiveProject(route.id));
        if (route.kind === "timeline") return json(200, await h.canvasTimeline(route.id, route.canvas));
        if (route.kind === "at") return json(200, await h.canvasAt(route.id, route.canvas, route.seq));
        return json(200, await h.readCanvasForPage(route.id, route.canvas));
      } catch (e) {
        return hubErrorResponse(e);
      }
    }
    // Everything else is a static file. With a password set only the sign-in page is open: the rest needs a session (src/site-gate.ts).
    const authed = await sessionOk(request, env.LITE_PASSWORD);
    const d = siteDecision(request.method, pathname, Boolean(env.LITE_PASSWORD), authed);
    if (d === "not-found") return new Response("not found", { status: 404 });
    if (d === "redirect-login") return Response.redirect(`${url.origin}/login`, 302);
    const res = await env.ASSETS.fetch(request);
    if (!env.LITE_PASSWORD) return res;
    const out = new Response(res.body, res); // password mode: what a session sees must not sit in a shared cache
    out.headers.set("Cache-Control", "private, no-cache");
    return out;
  },
} satisfies ExportedHandler<Env>;
