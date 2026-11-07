// The design-system tools end to end without the Hub (like scene-tools.test.ts): the same store functions the Hub calls, on an in-memory db.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDesignSystem, patchDesignSystem, setDesignSystem } from "../src/design-store.ts";
import { reviewFlow, validateFlow } from "../src/flow.ts";
import { createCanvas, setScreens } from "../src/canvases.ts";
import { DESIGN_TEXT } from "../src/design-system.ts";
import { openProject } from "../src/projects.ts";
import { eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const sql = nodeSql();
migrate(sql);
openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
openProject(sql, { name: "billing", manifest: { tree: [], files: {} } }, 1);

test("a project starts with no design system; set, patch and get end to end", () => {
  assert.deepEqual(getDesignSystem(sql, "tvdash"), { design: null });
  assert.throws(() => patchDesignSystem(sql, "tvdash", [{ group: "rules", value: "x" }]), /has no design system: use set_design_system first/);
  const set = setDesignSystem(sql, "tvdash", { name: "tvdash", colors: { bg: "#0a0c13" }, sizes: { body: 14 } }, 5);
  assert.equal(set.design.updated_at, 5);
  assert.match(set.design.markdown, /^# tvdash/);
  const patched = patchDesignSystem(sql, "tvdash", [{ group: "colors", name: "accent", value: "#7aa2ff" }], 6);
  assert.deepEqual(patched.design.tokens.colors, { bg: "#0a0c13", accent: "#7aa2ff" });
  assert.deepEqual(getDesignSystem(sql, "tvdash").design?.updated_at, 6);
  assert.deepEqual(getDesignSystem(sql, "billing"), { design: null }, "one project's system never shows in another");
});

test("a bad write stores nothing and appends no event; the event carries bytes, not the document", () => {
  const before = eventsAfter(sql, 0, 1000).length;
  assert.throws(() => setDesignSystem(sql, "tvdash", { colors: { a: "nope" } }), /invalid colors\.a/);
  assert.throws(() => patchDesignSystem(sql, "tvdash", [{ group: "colors", name: "a", value: "nope" }]), /invalid colors\.a/);
  assert.throws(() => setDesignSystem(sql, "gone", {}), /unknown project "gone"/);
  assert.equal(eventsAfter(sql, 0, 1000).length, before);
  assert.equal(getDesignSystem(sql, "tvdash").design?.tokens.colors.accent, "#7aa2ff");
  const ev = eventsAfter(sql, 0, 1000).filter((e) => e.kind === "design.set");
  assert.equal(ev.length, 2);
  assert.deepEqual(Object.keys(ev[0].payload as object), ["bytes"]);
});

test("review_prototype adds drift warnings only for a project that has a design system", () => {
  createCanvas(sql, "tvdash", { name: "Main", id: "main" });
  createCanvas(sql, "billing", { name: "Main", id: "main" });
  const html = "<body style='margin:0;width:100px;height:100px;background:#123456'>Hi</body>";
  const screens = [{ id: "home", name: "Home", width: 100, height: 100, html }];
  setScreens(sql, "tvdash", "main", screens);
  setScreens(sql, "billing", "main", screens);
  assert.ok(reviewFlow(sql, "tvdash", "main").issues.some((i) => i.kind === "off_token_color" && i.screen === "home"));
  assert.ok(!reviewFlow(sql, "billing", "main").issues.some((i) => i.kind.startsWith("off_token")));
  assert.ok(!validateFlow(sql, "tvdash", "main").issues.some((i) => i.kind.startsWith("off_token")), "validate_flow is about links only");
});

test("tool text tells Claude to read the design system first", () => {
  assert.match(DESIGN_TEXT.get_design_system, /READ IT BEFORE/);
});
