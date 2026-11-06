// The MCP server Claude talks to. Stateless: a fresh McpServer per request, all state in the Hub.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { hub } from "./hub.ts";
import { OPEN_PROJECT_TEXT } from "./projects.ts";

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
  const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
  // Hub errors cross the RPC boundary as exceptions; surface them as tool errors Claude can read and fix.
  const guard = async (fn: () => Promise<unknown>) => {
    try {
      return text(await fn());
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
    }
  };
  server.registerTool(
    "open_project",
    {
      title: "Open a project",
      description: OPEN_PROJECT_TEXT.description,
      inputSchema: z.object({
        id: z.string().optional().describe("Slug: lowercase letters, digits, -, at most 40. Defaults to the slugified name."),
        name: z.string().min(1).max(100).describe("Project name."),
        kind: z.string().min(1).max(40).optional().describe("Short label such as web, cli, library. Default: project."),
        repo: z.string().max(2000).optional().describe("URL of the remote repository."),
        manifest: z
          .object({
            tree: z.array(z.string()).describe(OPEN_PROJECT_TEXT.tree),
            files: z.record(z.string(), z.string()).describe(OPEN_PROJECT_TEXT.files),
          })
          .describe(OPEN_PROJECT_TEXT.manifest),
      }),
    },
    (input) => guard(() => hub(env).openProject(input)),
  );
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the projects Lite knows, newest opened first, without manifests. Use it to find a project id.",
      inputSchema: z.object({}),
    },
    () => guard(() => hub(env).listProjects()),
  );
  server.registerTool(
    "read_project",
    {
      title: "Read a project",
      description: "Return a project's summary, its stored manifest and its latest events. Use it to see what Lite was told about a project.",
      inputSchema: z.object({ id: z.string().describe("Project id from list_projects.") }),
    },
    ({ id }) => guard(() => hub(env).readProject(id)),
  );
  return server;
}

export const mcpHandler = createMcpHandler(createServer, { route: "/mcp" });
