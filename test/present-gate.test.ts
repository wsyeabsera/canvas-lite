import { test } from "node:test";
import assert from "node:assert/strict";
import { presentBlock } from "../src/present-gate.ts";
import { FLOW_TEXT, reviewFlow } from "../src/flow.ts";
import { createCanvas, setFlow, setScreens } from "../src/canvases.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const issue = (severity: "error" | "warning" | "info", kind: string, fix: string, screen?: string) => ({ severity, kind, message: kind, fix, ...(screen && { screen }) });

test("a passing review is not blocked", () => {
  assert.equal(presentBlock({ ok: true, score: 100, issues: [] }), null);
  assert.equal(presentBlock({ ok: true, score: 90, issues: [issue("info", "no_tour", "x")] }), null);
});

test("a failing review is blocked with the fixes, errors and warnings before info", () => {
  const m = presentBlock({ ok: false, score: 62, issues: [issue("error", "dangling_link", "create screen b", "a"), issue("warning", "dead_end", "add data-back", "b"), issue("info", "no_tour", "set a tour")] })!;
  assert.match(m, /scores 62 of 100/);
  assert.match(m, /dangling_link on "a": create screen b/);
  assert.match(m, /dead_end on "b": add data-back/);
  assert.doesNotMatch(m, /no_tour/);
  assert.match(m, /force: true/);
});

test("more than three issues say how many more", () => {
  const many = Array.from({ length: 5 }, (_, i) => issue("warning", `k${i}`, `fix ${i}`));
  assert.match(presentBlock({ ok: false, score: 70, issues: many })!, /and 2 more/);
});

test("ok but under the pass score still blocks, listing the info issues", () => {
  const m = presentBlock({ ok: true, score: 80, issues: [issue("info", "no_tour", "set a tour")] })!;
  assert.match(m, /no_tour: set a tour/);
});

test("the stored review is what gates: a dead end blocks, wiring it passes", () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "p", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "p", { name: "C" }, 2);
  setScreens(sql, "p", "c", [{ id: "a", name: "a", width: 400, height: 300, html: `<a data-to="b">b</a>` }, { id: "b", name: "b", width: 400, height: 300, html: `<p>end</p>` }], 3);
  setFlow(sql, "p", "c", { start_screen: "a" });
  assert.match(presentBlock(reviewFlow(sql, "p", "c"))!, /dead_end on "b"/);
  setScreens(sql, "p", "c", [{ id: "b", name: "b", width: 400, height: 300, html: `<a data-back>back</a>` }], 4);
  assert.equal(presentBlock(reviewFlow(sql, "p", "c")), null);
});

test("the present tool text names the gate and force", () => {
  assert.match(FLOW_TEXT.present, /force: true/);
});
