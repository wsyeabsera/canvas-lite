import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpUrl, mergeMcpJson } from "../cli/init-core.ts";

test("mcpUrl appends /mcp once and drops query and hash", () => {
  assert.equal(mcpUrl("http://127.0.0.1:8790"), "http://127.0.0.1:8790/mcp");
  assert.equal(mcpUrl("https://w.dev/mcp/?x=1#t"), "https://w.dev/mcp");
  assert.throws(() => mcpUrl("ftp://w.dev"));
});

test("merge creates a file with an env token reference, never a token value", () => {
  const out = JSON.parse(mergeMcpJson(null, { url: "https://w.dev", devtools: false }));
  assert.deepEqual(out.mcpServers.lite, { type: "http", url: "https://w.dev/mcp", headers: { Authorization: "Bearer ${LITE_TOKEN}" } });
  assert.equal(out.mcpServers["chrome-devtools"], undefined);
});

test("merge keeps other servers and keys, is idempotent, adds devtools on request", () => {
  const start = JSON.stringify({ extra: 1, mcpServers: { other: { command: "x" }, lite: { url: "old" } } });
  const once = mergeMcpJson(start, { url: "https://w.dev", devtools: true });
  const doc = JSON.parse(once);
  assert.equal(doc.extra, 1);
  assert.deepEqual(doc.mcpServers.other, { command: "x" });
  assert.equal(doc.mcpServers.lite.url, "https://w.dev/mcp");
  assert.equal(doc.mcpServers["chrome-devtools"].command, "npx");
  assert.equal(mergeMcpJson(once, { url: "https://w.dev", devtools: true }), once);
});

test("merge refuses invalid or non-object JSON", () => {
  assert.throws(() => mergeMcpJson("{nope", { url: "https://w.dev", devtools: false }), /not valid JSON/);
  assert.throws(() => mergeMcpJson("[]", { url: "https://w.dev", devtools: false }), /object/);
});

import { skillsHash, skillsStatus, stampText, pluginFiles } from "../cli/init-core.ts";
import { SKILLS_HASH } from "../src/skills-hash.ts";

test("skillsHash changes with content and path, not with file order", () => {
  const a = { path: "skills/x/SKILL.md", content: "one" };
  const b = { path: "commands/y.md", content: "two" };
  assert.equal(skillsHash([a, b]), skillsHash([b, a]));
  assert.notEqual(skillsHash([a, b]), skillsHash([{ ...a, content: "changed" }, b]));
  assert.notEqual(skillsHash([a, b]), skillsHash([{ ...a, path: "skills/z/SKILL.md" }, b]));
});

test("skillsStatus: current, stale, missing, garbage counts as stale", () => {
  assert.equal(skillsStatus(stampText("abc"), "abc"), "current");
  assert.equal(skillsStatus(stampText("old"), "abc"), "stale");
  assert.equal(skillsStatus(null, "abc"), "missing");
  assert.equal(skillsStatus("{nope", "abc"), "stale");
});

test("the hash the Worker reports from ping matches the plugin files (regenerate: node scripts/skills-hash.ts)", () => {
  const plugin = new URL("../plugin/lite-prototyping/", import.meta.url).pathname;
  assert.equal(SKILLS_HASH, skillsHash(pluginFiles(plugin)));
});
