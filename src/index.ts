import { gateApi, gateResponse, hubErrorResponse, isApiPath, json, routeApi } from "./api.ts";
import { bearerToken, misconfigured, tokenOk } from "./auth.ts";
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
      if (pathname === "/events") return hub(env).fetch(request);
      if (!tokenOk(bearerToken(request.headers.get("Authorization")), env.LITE_TOKEN))
        return new Response("unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
      return mcpHandler(request, env, ctx);
    }
    if (isApiPath(pathname)) {
      const gate = gateApi(request.headers.get("Authorization"), env.LITE_TOKEN, url);
      if (gate !== "ok") return gateResponse(gate);
      const route = routeApi(request.method, pathname);
      if (route.kind === "error") return json(route.status, { error: route.message }, route.headers);
      try {
        const h = hub(env);
        if (route.kind === "list") return json(200, await h.listProjects());
        if (route.kind === "read") return json(200, await h.readProject(route.id, true));
        if (route.kind === "canvases") return json(200, await h.listCanvases(route.id));
        if (route.kind === "timeline") return json(200, await h.canvasTimeline(route.id, route.canvas));
        if (route.kind === "at") return json(200, await h.canvasAt(route.id, route.canvas, route.seq));
        return json(200, await h.readCanvasForPage(route.id, route.canvas));
      } catch (e) {
        return hubErrorResponse(e);
      }
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
