import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDesign, designEventHits, designSummary, paintable } from "../web/design.ts";

const api = {
  design: {
    tokens: { name: "tvdash", colors: { bg: "#0a0c13", accent: "#7aa2ff" }, fonts: { body: "Inter, sans-serif" }, sizes: {}, space: { md: 16 }, radius: {}, rules: "One accent." },
    markdown: "# tvdash\n",
    updated_at: 5,
  },
};

test("describeDesign: non-empty groups in order, rules, markdown; null when none or unreadable", () => {
  const m = describeDesign(api)!;
  assert.deepEqual(m.groups.map((g) => [g.key, g.tokens.length]), [["colors", 2], ["fonts", 1], ["space", 1]]);
  assert.deepEqual([m.name, m.rules, m.markdown, m.updated_at], ["tvdash", "One accent.", "# tvdash\n", 5]);
  assert.equal(describeDesign({ design: null }), null);
  for (const bad of [null, undefined, "x", {}, { design: {} }, { design: { tokens: [] } }]) assert.equal(describeDesign(bad), null, String(bad));
  const gappy = describeDesign({ design: { tokens: { colors: { a: "#fff", b: { x: 1 }, c: 3 } } } })!;
  assert.deepEqual(gappy.groups[0].tokens, [{ name: "a", value: "#fff" }, { name: "c", value: 3 }]);
  assert.deepEqual([gappy.name, gappy.markdown, gappy.updated_at], ["", "", 0]);
});

test("designSummary counts per group with singular and plural", () => {
  assert.equal(designSummary(describeDesign(api)!), "2 colors · 1 font · 1 space token");
  assert.equal(designSummary(describeDesign({ design: { tokens: {} } })!), "empty");
});

test("only #rrggbb is painted, whatever the server sent", () => {
  assert.equal(paintable("#0a0c13"), true);
  for (const bad of ["#fff", "red", "url(x)", "#0A0C13", 5]) assert.equal(paintable(bad as never), false, String(bad));
});

test("a design.set of the project on show refetches, nothing else does", () => {
  const route = { view: "design", id: "tv" } as const;
  assert.equal(designEventHits(route, { project: "tv", kind: "design.set" }), true);
  assert.equal(designEventHits(route, { project: "other", kind: "design.set" }), false);
  assert.equal(designEventHits(route, { project: "tv", kind: "scene.set" }), false);
  assert.equal(designEventHits({ view: "landing" }, { project: "tv", kind: "design.set" }), false);
});
