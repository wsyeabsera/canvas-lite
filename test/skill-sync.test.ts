import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string): string => String(readFileSync(`${import.meta.dirname}/../${p}`));

test("the repo skill is a byte copy of the plugin skill (run node scripts/sync-skill.mjs)", () => {
  assert.equal(read(".agents/skills/lite-prototyping/SKILL.md"), read("plugin/lite-prototyping/skills/prototyping/SKILL.md"));
});

test("the repo scenes skill is a byte copy of the plugin scenes skill (run node scripts/sync-skill.mjs)", () => {
  assert.equal(read(".agents/skills/lite-scenes/SKILL.md"), read("plugin/lite-prototyping/skills/scenes/SKILL.md"));
});

test("the repo tournament skill is a byte copy of the plugin tournament skill (run node scripts/sync-skill.mjs)", () => {
  assert.equal(read(".agents/skills/lite-tournament/SKILL.md"), read("plugin/lite-prototyping/skills/tournament/SKILL.md"));
});

test("tournament skill: valid frontmatter, the blind-user and honesty rules, and a command that uses it", () => {
  const skill = read("plugin/lite-prototyping/skills/tournament/SKILL.md");
  assert.ok(/^---\nname: lite-tournament\ndescription: .+\n---\n/.exec(skill), "frontmatter");
  for (const w of ["tournament_start", "walk_start", "walk_step", "tournament_results", "merge_variant", "FRESH subagent", "not proof", "before any variant exists", "Only when told which variant", "nothing is real", "pressing Pay buys nothing"]) assert.ok(skill.includes(w), w);
  const cmd = read("plugin/lite-prototyping/commands/tournament.md");
  assert.match(cmd, /^---\ndescription: .+\nargument-hint: <.+>\n---\n/);
  assert.ok(cmd.includes("$ARGUMENTS") && cmd.includes("lite-tournament") && cmd.includes("simulated"));
});

test("the sync script covers every skill", () => {
  const script = read("scripts/sync-skill.mjs");
  for (const p of ["skills/prototyping/SKILL.md", "skills/scenes/SKILL.md", "skills/tournament/SKILL.md", ".agents/skills/lite-prototyping/SKILL.md", ".agents/skills/lite-scenes/SKILL.md", ".agents/skills/lite-tournament/SKILL.md"]) assert.ok(script.includes(p), p);
});

test("scenes skill frontmatter is valid and the process names the tools and anti-patterns", () => {
  const skill = read("plugin/lite-prototyping/skills/scenes/SKILL.md");
  assert.ok(/^---\nname: lite-scenes\ndescription: .+\n---\n/.exec(skill), "frontmatter");
  for (const w of ["set_scene", "set_films", "validate_scene", "review_scene", "score >= 90", "Anti-patterns", "Grey boxes", "No lighting", "single shot", "Camera inside geometry", "Walkable", "Brief and shot list"]) assert.ok(skill.toLowerCase().includes(w.toLowerCase()), w);
  const cmd = read("plugin/lite-prototyping/commands/scene.md");
  assert.match(cmd, /^---\ndescription: .+\nargument-hint: <what to build>\n---\n/);
  assert.ok(cmd.includes("$ARGUMENTS") && cmd.includes("lite-scenes") && cmd.includes("review_scene"));
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
