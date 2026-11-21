import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Pure part of `lite init`: merge the Lite (and optional chrome-devtools) servers into a project's .mcp.json text.
export const DEFAULT_URL = "https://lite.tvdash-hub.workers.dev";

export const DEVTOOLS_SERVER = {
  command: "npx",
  args: ["-y", "chrome-devtools-mcp@1.12.0", "--no-usage-statistics"],
};

export function mcpUrl(input: string): string {
  const u = new URL(input);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("url must be http(s)");
  u.hash = "";
  u.search = "";
  u.pathname = u.pathname.replace(/\/+$/, "").replace(/\/mcp$/, "") + "/mcp";
  return u.toString();
}

// Keeps every other server and top-level key; replaces `lite` (and `chrome-devtools` when asked). The token stays an env reference, never a value.
export function mergeMcpJson(existing: string | null, opts: { url: string; devtools: boolean }): string {
  let doc: Record<string, unknown> = {};
  if (existing !== null && existing.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch {
      throw new Error(".mcp.json is not valid JSON; fix it first");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(".mcp.json must be an object");
    doc = parsed as Record<string, unknown>;
  }
  const servers = (typeof doc.mcpServers === "object" && doc.mcpServers !== null ? doc.mcpServers : {}) as Record<string, unknown>;
  servers.lite = { type: "http", url: mcpUrl(opts.url), headers: { Authorization: "Bearer ${LITE_TOKEN}" } };
  if (opts.devtools) servers["chrome-devtools"] = DEVTOOLS_SERVER;
  return JSON.stringify({ ...doc, mcpServers: servers }, null, 2) + "\n";
}

/** Hash of the plugin's skills and commands: sorted relative path + content, so a rename or an edit changes it. */
export function skillsHash(files: { path: string; content: string }[]): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(`${f.path}\0${f.content}\0`);
  return h.digest("hex").slice(0, 16);
}

/** The files that `lite init` copies and the hash covers: skills/ and commands/ under the plugin folder. */
export function pluginFiles(pluginDir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(join(pluginDir, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else out.push({ path: r, content: readFileSync(join(pluginDir, r), "utf8") });
    }
  };
  walk("skills");
  walk("commands");
  return out;
}

export type SkillsStatus = "current" | "stale" | "missing";

/** Compares a project's recorded stamp (the text of .claude/lite-skills.json, or null) with the checkout's hash. */
export function skillsStatus(stamp: string | null, current: string): SkillsStatus {
  if (stamp === null) return "missing";
  try {
    return JSON.parse(stamp)?.hash === current ? "current" : "stale";
  } catch {
    return "stale";
  }
}

export const stampText = (hash: string): string => JSON.stringify({ hash }) + "\n";

export const STATUS_MESSAGE: Record<SkillsStatus, string> = {
  current: "skills are up to date",
  stale: "skills are out of date: run `lite init` in this project",
  missing: "no skills recorded: run `lite init` in this project",
};
