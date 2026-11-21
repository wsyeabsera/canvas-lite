// `lite init`: wire a project to Lite. Usage: node <lite>/cli/init.ts [dir] [--url <worker url>] [--devtools] [--check]
// The URL defaults to the deployed Worker; --url or LITE_URL overrides it (local dev: http://127.0.0.1:8790).
// `--check` only compares the project's recorded skills with this checkout (exit 1 when stale or missing).
// Writes <dir>/.mcp.json (merged) and copies the Lite skills and commands into <dir>/.claude/. Re-run to update.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_URL, mergeMcpJson, pluginFiles, skillsHash, skillsStatus, STATUS_MESSAGE, stampText } from "./init-core.ts";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--url");
const url = flag("--url") ?? process.env.LITE_URL ?? DEFAULT_URL;
const dir = resolve(positional[0] ?? ".");
if (!existsSync(dir)) {
  console.error(`no such directory: ${dir}`);
  process.exit(2);
}

const plugin = new URL("../plugin/lite-prototyping/", import.meta.url).pathname;
const stampPath = join(dir, ".claude/lite-skills.json");
const hash = skillsHash(pluginFiles(plugin));
if (argv.includes("--check")) {
  const status = skillsStatus(existsSync(stampPath) ? readFileSync(stampPath, "utf8") : null, hash);
  console.log(STATUS_MESSAGE[status]);
  process.exit(status === "current" ? 0 : 1);
}
try {
  const mcpPath = join(dir, ".mcp.json");
  writeFileSync(mcpPath, mergeMcpJson(existsSync(mcpPath) ? readFileSync(mcpPath, "utf8") : null, { url, devtools: argv.includes("--devtools") }));
  console.log("wrote .mcp.json");
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

for (const name of readdirSync(join(plugin, "skills"))) {
  const to = join(dir, ".claude/skills", `lite-${name}`);
  mkdirSync(to, { recursive: true });
  cpSync(join(plugin, "skills", name), to, { recursive: true });
  console.log(`copied skill lite-${name}`);
}
mkdirSync(join(dir, ".claude/commands"), { recursive: true });
cpSync(join(plugin, "commands"), join(dir, ".claude/commands"), { recursive: true });
console.log("copied commands (/prototype, /scene, /tournament)");
writeFileSync(stampPath, stampText(hash));

console.log("\nNext: export LITE_TOKEN=<your token> (never commit it), then start claude in the project and approve the lite server.");
