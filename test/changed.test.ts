import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, importers, importsOf, resolveImport, transitiveDeps } from "../scripts/lib/graph.ts";
import { selectTests } from "../scripts/lib/select.ts";
import { checkInventory, countTests, lowerInventory } from "../scripts/lib/inventory.ts";

const sources = new Map([
  ["src/a.ts", `import { b } from "./b.ts";\nimport type { X } from "../src/c.ts";\nimport { z } from "zod";`],
  ["src/b.ts", `export { d } from "./d.ts";`],
  ["src/c.ts", `export const c = 1;`],
  ["src/d.ts", `import {\n  e,\n} from "./e.ts";`],
  ["src/e.ts", `export const e = 1;`],
  ["src/lonely.ts", `export const l = 1;`],
  ["src/index.ts", `import "./lonely.ts";\nconst m = await import("./c.ts");`],
  ["test/a.test.ts", `import { a } from "../src/a.ts";`],
  ["test/e.test.ts", `import { e } from "../src/e.ts";`],
  ["test/other.test.ts", `import { test } from "node:test";`],
]);
const graph = buildGraph(sources);
const tests = ["test/a.test.ts", "test/e.test.ts", "test/other.test.ts"];

test("importsOf finds relative static, re-export, side-effect and dynamic imports only", () => {
  assert.deepEqual(importsOf(sources.get("src/a.ts")!), ["./b.ts", "../src/c.ts"]);
  assert.deepEqual(importsOf(sources.get("src/b.ts")!), ["./d.ts"]);
  assert.deepEqual(importsOf(sources.get("src/d.ts")!), ["./e.ts"]);
  assert.deepEqual(importsOf(sources.get("src/index.ts")!), ["./lonely.ts", "./c.ts"]);
});

test("resolveImport adds extensions and index files, null when unknown", () => {
  const known = new Set(["src/x.ts", "src/dir/index.ts"]);
  assert.equal(resolveImport("test/t.test.ts", "../src/x", known), "src/x.ts");
  assert.equal(resolveImport("test/t.test.ts", "../src/dir", known), "src/dir/index.ts");
  assert.equal(resolveImport("test/t.test.ts", "../src/nope.ts", known), null);
});

test("graph: transitive deps and importers", () => {
  assert.deepEqual([...transitiveDeps("test/a.test.ts", graph)].sort(), ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"]);
  assert.deepEqual(importers("src/e.ts", graph).sort(), ["src/d.ts", "test/e.test.ts"]);
  const cyc = buildGraph(new Map([["a.ts", `import "./b.ts"`], ["b.ts", `import "./a.ts"`]]));
  assert.deepEqual([...transitiveDeps("a.ts", cyc)].sort(), ["a.ts", "b.ts"]);
});

const plan = (changed: string[], exists?: (f: string) => boolean) => selectTests({ changed, tests, graph, exists });

test("select: a deep dependency picks the tests that import it transitively", () => {
  const p = plan(["src/e.ts"]);
  assert.equal(p.all, false);
  assert.deepEqual(p.tests, ["test/a.test.ts", "test/e.test.ts"]);
  assert.deepEqual(plan(["src/b.ts"]).tests, ["test/a.test.ts"]);
});

test("select: prose, docs and site changes need no tests", () => {
  const p = plan(["docs/ARCHITECTURE.md", "site/docusaurus.config.js", "CLAUDE.md"]);
  assert.deepEqual(p, { all: false, reason: "nothing to test changed", tests: [] });
});

test("select: a test file, package.json, tsconfig, an unimported or deleted file, or an unknown file runs everything", () => {
  assert.equal(plan(["test/e.test.ts"]).all, true);
  assert.equal(plan(["package.json"]).all, true);
  assert.equal(plan(["package-lock.json"]).all, true);
  assert.equal(plan(["tsconfig.json"]).all, true);
  assert.equal(plan(["src/index.ts"]).all, true);
  assert.equal(plan(["src/gone.ts"], () => false).all, true);
  assert.equal(plan(["wrangler.jsonc"]).all, true);
  assert.deepEqual(plan(["package.json"]).tests, tests);
});

test("select: one file nothing imports among otherwise covered changes still runs all", () => {
  assert.equal(plan(["src/e.ts", "src/index.ts"]).all, true);
});

test("inventory: counts test( calls, refuses a drop, lowers only with a reason recorded", () => {
  const src = ["test('a', () => {});", "  test.skip('b', f);", "latest(1);", "const s = test('c');"].join("\n");
  assert.equal(countTests(src), 2);
  const inv = { count: 5, history: [] };
  assert.equal(checkInventory(5, inv), null);
  assert.equal(checkInventory(6, inv), null);
  assert.match(checkInventory(4, inv)!, /dropped/);
  assert.deepEqual(lowerInventory(4, inv, "merged duplicates", "2026-11-06"), {
    count: 4,
    history: [{ count: 4, reason: "merged duplicates", date: "2026-11-06" }],
  });
});
