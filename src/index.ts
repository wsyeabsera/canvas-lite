import { hub } from "./hub.ts";
import { mcpHandler } from "./mcp.ts";

export { Hub } from "./hub.ts";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return mcpHandler(request, env, ctx);
    if (pathname === "/events") return hub(env).fetch(request);
    if (request.method === "GET" && pathname === "/health") return Response.json({ status: "ok" });
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
