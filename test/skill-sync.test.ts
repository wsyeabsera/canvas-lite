import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string): string => String(readFileSync(`${import.meta.dirname}/../${p}`));

test("the repo skill is a byte copy of the plugin skill (run node scripts/sync-skill.mjs)", () => {
  assert.equal(read(".agents/skills/lite-prototyping/SKILL.md"), read("plugin/lite-prototyping/skills/prototyping/SKILL.md"));
});

test("skill frontmatter is valid and the process names the tools", () => {
  const skill = read("plugin/lite-prototyping/skills/prototyping/SKILL.md");
  const fm = /^---\nname: lite-prototyping\ndescription: .+\n---\n/.exec(skill);
  assert.ok(fm, "frontmatter");
  for (const w of ["set_screens", "set_flow", "validate_flow", "review_prototype", "set_tour", "score >= 90", "Anti-patterns"]) assert.ok(skill.includes(w), w);
});

test("plugin manifest and MCP template carry no token", () => {
  const plugin = JSON.parse(read("plugin/lite-prototyping/.claude-plugin/plugin.json"));
  assert.deepEqual([plugin.name, plugin.version], ["lite-prototyping", "0.1.0"]);
  const raw = read("plugin/lite-prototyping/.mcp.json");
  const mcp = JSON.parse(raw);
  assert.equal(mcp.mcpServers.lite.type, "http");
  assert.equal(mcp.mcpServers.lite.headers.Authorization, "Bearer ${LITE_TOKEN}");
  assert.match(mcp.mcpServers.lite.url, /<your-worker>/);
});
