// The MCP server Claude talks to. Stateless: a fresh McpServer per request, all state in the Hub.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { hub } from "./hub.ts";

function createServer(): McpServer {
  const server = new McpServer({ name: "lite", version: "0.1.0" });
  server.registerTool(
    "ping",
    {
      title: "Ping Lite",
      description: "Append a ping event and return it. Use it to check that Lite is reachable and recording.",
      inputSchema: z.object({ note: z.string().max(200).optional().describe("Optional short note stored with the event.") }),
    },
    async ({ note }) => ({ content: [{ type: "text" as const, text: JSON.stringify(await hub(env).ping(note)) }] }),
  );
  return server;
}

export const mcpHandler = createMcpHandler(createServer, { route: "/mcp" });
