import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDesignEdits, checkDesignSystem, emptyDesignSystem, normalizeHex, renderDesignMd } from "../src/design-system.ts";
import { driftIssues } from "../src/design-drift.ts";

const ds = checkDesignSystem({
  name: "tvdash",
  colors: { bg: "#0A0C13", accent: "#7aa", text: "#f3f5fa" },
  fonts: { body: "Inter, system-ui, sans-serif", mono: "ui-monospace, Menlo, monospace" },
  sizes: { body: 14, title: 34 },
  space: { md: 16 },
  radius: { card: 16 },
  rules: "One accent color.",
});

test("normalizeHex expands and lowercases, and rejects non-hex", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("#0A0C13"), "#0a0c13");
  for (const bad of ["abc", "#abcd", "#12345", "rgb(1,2,3)", "#ggg"]) assert.equal(normalizeHex(bad), null, bad);
});

test("checkDesignSystem normalizes, fills missing groups and names the bad path", () => {
  assert.deepEqual(ds.colors, { bg: "#0a0c13", accent: "#77aaaa", text: "#f3f5fa" });
  assert.deepEqual(checkDesignSystem({}), emptyDesignSystem());
  assert.throws(() => checkDesignSystem({ colors: { Bad: "#fff" } }), /colors\.Bad.*token name/);
  assert.throws(() => checkDesignSystem({ colors: { a: "red" } }), /invalid colors\.a: use a color/);
  assert.throws(() => checkDesignSystem({ fonts: { a: "x; y" } }), /invalid fonts\.a/);
  assert.throws(() => checkDesignSystem({ sizes: { a: 1.5 } }), /invalid sizes\.a/);
  assert.throws(() => checkDesignSystem({ space: { a: 1000 } }), /invalid space\.a/);
  assert.throws(() => checkDesignSystem({ shadow: {} }), /unknown key "shadow"/);
  assert.throws(() => checkDesignSystem([]), /expected an object/);
  assert.throws(() => checkDesignSystem({ rules: "x".repeat(8001) }), /invalid rules/);
  const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`t${i}`, 1]));
  assert.throws(() => checkDesignSystem({ space: many }), /at most 64 tokens/);
});

test("applyDesignEdits sets, removes, edits text and re-checks the whole result", () => {
  const next = applyDesignEdits(ds, [{ group: "colors", name: "accent", value: "#112233" }, { group: "space", name: "md", remove: true }, { group: "rules", value: "New rules." }, { group: "sizes", name: "h2", value: 20 }]);
  assert.equal(next.colors.accent, "#112233");
  assert.deepEqual(next.space, {});
  assert.equal(next.rules, "New rules.");
  assert.equal(next.sizes.h2, 20);
  assert.equal(ds.colors.accent, "#77aaaa", "input untouched");
  assert.throws(() => applyDesignEdits(ds, [{ group: "colors", name: "x", value: "nope" }]), /invalid colors\.x/);
  assert.throws(() => applyDesignEdits(ds, [{ group: "colors", name: "zzz", remove: true }]), /invalid edit 0: no token "zzz"/);
  assert.throws(() => applyDesignEdits(ds, [{ group: "colors", name: "x" }]), /needs a value/);
  assert.throws(() => applyDesignEdits(ds, [{ group: "rules" }]), /needs a text value/);
  assert.throws(() => applyDesignEdits(ds, []), /1 to 50 edits/);
  assert.throws(() => applyDesignEdits(ds, [{ group: "weird", name: "a", value: 1 } as never]), /group must be one of/);
});

test("renderDesignMd: heading, rules, a table per non-empty group, pipes escaped", () => {
  const md = renderDesignMd(ds);
  assert.match(md, /^# tvdash\n\nOne accent color\.\n\n## Colors\n\| Token \| Value \|\n\|---\|---\|\n\| bg \| #0a0c13 \|/);
  assert.match(md, /## Sizes \(px\)\n\| Token \| Value \|\n\|---\|---\|\n\| body \| 14 \|/);
  assert.equal(renderDesignMd(emptyDesignSystem()), "# Design system\n");
  assert.match(renderDesignMd(checkDesignSystem({ fonts: { a: "A | B" } })), /\| a \| A \\\| B \|/);
});

const screen = (css: string, body = "") => ({ id: "home", html: `<!doctype html><html><head><style>${css}</style></head><body>${body}</body></html>` });

test("drift: colors in CSS and style attributes, alpha and rgb ignored, text ignored", () => {
  assert.deepEqual(driftIssues([screen("body{background:#0a0c13;color:#F3F5FA;border:1px solid rgba(10,12,19,.5)}")], ds), []);
  const off = driftIssues([screen("body{background:#123456}", "<p style='color:rgb(255, 0, 0)'>#abcdef in text</p>")], ds);
  assert.deepEqual(off.map((i) => [i.kind, i.severity, i.screen]), [["off_token_color", "warning", "home"]]);
  assert.match(off[0].message, /#123456, #ff0000/);
  assert.doesNotMatch(off[0].message, /abcdef/);
  assert.match(off[0].fix, /patch_design_system/);
  assert.deepEqual(driftIssues([screen("#abc{margin:0} a:hover #bad{padding:2px}")], ds), [], "selectors are not colors");
});

test("drift: fonts by first family, sizes in px, at most five values shown", () => {
  assert.deepEqual(driftIssues([screen("body{font:14px x;font-family:'Inter',serif;font-size:14px} code{font-family:ui-monospace,monospace;font-size:34px}")], ds), []);
  const k = driftIssues([screen("p{font-family:Georgia,serif;font-size:13px} h1{font-size:41.5px}")], ds).map((i) => i.kind);
  assert.deepEqual(k, ["off_token_font", "off_token_size"]);
  const many = driftIssues([screen(Array.from({ length: 8 }, (_, i) => `a${i}{color:#00000${i}}`).join(""))], ds);
  assert.match(many[0].message, /and 3 more/);
});

test("drift: a group with no tokens is not checked", () => {
  assert.deepEqual(driftIssues([screen("p{color:#123456;font-family:Georgia;font-size:13px}")], emptyDesignSystem()), []);
});

test("drift: an inline style that ends without a semicolon does not hide the colors after it", () => {
  const html = "<body><div style='display:flex;gap:12px'>x</div><div style='background:linear-gradient(135deg,#1e293b,#4338ca)'></div><i style='color:#123456'></i></body>";
  const [issue] = driftIssues([{ id: "home", html }], ds);
  assert.match(issue.message, /#1e293b, #4338ca, #123456/);
});
