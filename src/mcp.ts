// The MCP server Claude talks to. Stateless: a fresh McpServer per request, all state in the Hub.
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { hub } from "./hub.ts";
import { CANVAS_TEXT, MAX_SIZE, MIN_SIZE, SCREENS_PER_CALL } from "./canvases.ts";
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
      description:
        "Return a project's summary and its latest events. The stored manifest (tree and excerpts, up to 65536 bytes) is left out unless you set include_manifest to true; ask for it only when you need the file tree.",
      inputSchema: z.object({
        id: z.string().describe("Project id from list_projects."),
        include_manifest: z.boolean().optional().describe("Also return the stored manifest. Default false."),
      }),
    },
    ({ id, include_manifest }) => guard(() => hub(env).readProject(id, include_manifest ?? false)),
  );
  server.registerTool(
    "remove_project",
    {
      title: "Remove a project",
      description:
        "Archive a project: it disappears from list_projects and the watch page's project list, and a project.removed event is recorded. Nothing is deleted: read_project still works on the id, and open_project with the same id brings it back. Removing an already archived project does nothing.",
      inputSchema: z.object({ id: z.string().describe("Project id from list_projects.") }),
    },
    ({ id }) => guard(() => hub(env).removeProject(id)),
  );
  const project = z.string().describe("Project id from list_projects (an existing, not removed project).");
  const canvas = z.string().describe("Canvas id from list_canvases.");
  server.registerTool(
    "create_canvas",
    {
      title: "Create a canvas",
      description: CANVAS_TEXT.create_canvas,
      inputSchema: z.object({
        project,
        name: z.string().min(1).max(100).describe("Canvas name."),
        id: z.string().optional().describe("Slug: lowercase letters, digits, -, at most 40. Defaults to the slugified name."),
      }),
    },
    ({ project, ...input }) => guard(async () => hub(env).createCanvas(project, input)),
  );
  server.registerTool(
    "list_canvases",
    { title: "List canvases", description: CANVAS_TEXT.list_canvases, inputSchema: z.object({ project }) },
    ({ project }) => guard(async () => hub(env).listCanvases(project)),
  );
  server.registerTool(
    "read_canvas",
    {
      title: "Read a canvas",
      description: CANVAS_TEXT.read_canvas,
      inputSchema: z.object({ project, canvas, include_html: z.boolean().optional().describe("Also return each screen's html. Default false.") }),
    },
    ({ project, canvas, include_html }) => guard(async () => hub(env).readCanvas(project, canvas, include_html ?? false)),
  );
  const screenFields = {
    name: z.string().min(1).max(100).describe("Screen name."),
    width: z.number().int().min(MIN_SIZE).max(MAX_SIZE).describe(`Width in CSS pixels, ${MIN_SIZE} to ${MAX_SIZE}.`),
    height: z.number().int().min(MIN_SIZE).max(MAX_SIZE).describe(`Height in CSS pixels, ${MIN_SIZE} to ${MAX_SIZE}.`),
    html: z.string().describe("One self-contained HTML document: inline CSS, no scripts, root sized to width x height."),
    id: z.string().optional().describe("Slug: lowercase letters, digits, -, at most 40. Defaults to the slugified name truncated at 40 characters; an existing id is replaced. Pass it explicitly to be safe."),
    x: z.number().int().optional().describe("Canvas x position in pixels. Leave out for automatic layout."),
    y: z.number().int().optional().describe("Canvas y position in pixels. Leave out for automatic layout."),
  };
  server.registerTool(
    "set_screen",
    { title: "Set a screen", description: CANVAS_TEXT.set_screen, inputSchema: z.object({ project, canvas, ...screenFields }) },
    ({ project, ...input }) => guard(async () => hub(env).setScreen(project, input)),
  );
  server.registerTool(
    "set_screens",
    {
      title: "Set several screens",
      description: CANVAS_TEXT.set_screens,
      inputSchema: z.object({
        project,
        canvas,
        screens: z.array(z.object(screenFields)).min(1).max(SCREENS_PER_CALL).describe(`1 to ${SCREENS_PER_CALL} screens; all are written or none.`),
      }),
    },
    ({ project, canvas, screens }) => guard(async () => hub(env).setScreens(project, canvas, screens)),
  );
  server.registerTool(
    "remove_screen",
    {
      title: "Remove a screen",
      description: CANVAS_TEXT.remove_screen,
      inputSchema: z.object({ project, canvas, id: z.string().describe("Screen id from read_canvas.") }),
    },
    ({ project, canvas, id }) => guard(async () => hub(env).removeScreen(project, canvas, id)),
  );
  server.registerTool(
    "remove_canvas",
    { title: "Remove a canvas", description: CANVAS_TEXT.remove_canvas, inputSchema: z.object({ project, canvas }) },
    ({ project, canvas }) => guard(async () => hub(env).removeCanvas(project, canvas)),
  );
  return server;
}

export const mcpHandler = createMcpHandler(createServer, { route: "/mcp" });
