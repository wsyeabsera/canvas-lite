import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageOf, isControlLike, scanControls, unlinkedControls, unlinkedSummary, unlinkedWarnings } from "../src/coverage.ts";
import { createCanvas, setScreen, setScreens } from "../src/canvases.ts";
import { patchScreen, validateFlow, validateScreens } from "../src/flow.ts";
import { isUnlinkedControl, UNLINKED_SELECTOR } from "../web/play.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const attrs = (o: Record<string, string>) => (n: string) => o[n] ?? null;

test("detects every kind of control-like element with its text", () => {
  const html = `<button>Pay now</button><a href="#">Terms</a><input placeholder="Email"><select></select><details><summary>More</summary></details>
    <div role="button">Role</div><div role="link">L</div><div role=tab>T</div><div role="menuitem">M</div><div tabindex="0">Tab</div><span style="color:red; cursor: pointer">Cur</span>`;
  const got = unlinkedControls(html);
  assert.deepEqual(got.map((c) => c.text), ["Pay now", "Terms", "Email", "", "More", "Role", "L", "T", "M", "Tab", "Cur"]);
  assert.deepEqual(got.map((c) => c.tag).slice(0, 5), ["button", "a", "input", "select", "summary"]);
});

test("not controls: plain markup, hidden input, tabindex -1, inline cursor:default", () => {
  assert.deepEqual(unlinkedControls(`<div>x</div><input type="hidden"><div tabindex="-1">a</div><p style="cursor:default">b</p><img alt="a">`), []);
});

test("data-to and data-back link a control, on itself or on an ancestor", () => {
  const html = `<button data-to="a">A</button><a data-back>B</a><div data-to="c"><button>C<b>x</b></button><span tabindex="0">d</span></div><button>Loose</button>`;
  const s = scanControls(html);
  assert.deepEqual(s.items.map((i) => i.text), ["Loose"]);
  assert.equal(s.controls, 5);
  assert.equal(s.linked, 4);
});

test("data-inert on a control or an ancestor hides it and does not count it", () => {
  const s = scanControls(`<button data-inert>Decor</button><div data-inert><a>X</a><button>Y</button></div><button data-inert="false">Z</button><button data-to="a">Go</button>`);
  assert.deepEqual(s.items.map((i) => i.text), ["Z"]);
  assert.equal(s.controls, 2);
});

test("a control inside an unlinked control is reported once (the outer one)", () => {
  assert.deepEqual(unlinkedControls(`<button>Outer <a>inner</a></button>`).map((i) => i.tag), ["button"]);
});

test("text: first 40 chars, tags and whitespace collapsed, fallbacks for empty", () => {
  const [a, b, c] = unlinkedControls(`<button>  Hello\n  <b>big</b> world ${"x".repeat(60)}</button><button aria-label="Close"></button><input value="Go">`);
  assert.equal(a!.text.length, 40);
  assert.ok(a!.text.startsWith("Hello big world xxx"));
  assert.equal(b!.text, "Close");
  assert.equal(c!.text, "Go");
});

test("ignores comments, script and style bodies; tolerates malformed html and unclosed tags", () => {
  const got = unlinkedControls(`<!-- <button>no</button> --><script>var s="<button>x</button>"</script><style>a{cursor:pointer}</style><button>Real`);
  assert.deepEqual(got.map((c) => c.text), ["Real"]);
  assert.doesNotThrow(() => unlinkedControls(`<<<button <a "`));
});

test("caps the list (default 20, adjustable) while counting all", () => {
  const html = "<button>b</button>".repeat(30);
  assert.equal(unlinkedControls(html).length, 20);
  assert.equal(unlinkedControls(html, 3).length, 3);
  assert.equal(scanControls(html).unlinked, 30);
});

test("summary and warnings: max 5 samples, never for a clean screen", () => {
  assert.deepEqual(unlinkedWarnings(`<button data-to="a">ok</button>`), []);
  const w = unlinkedWarnings(Array.from({ length: 7 }, (_, i) => `<button>B${i}</button>`).join(""));
  assert.deepEqual(w, [`7 unlinked controls: "B0", "B1", "B2", "B3", "B4", +2 more`]);
  assert.equal(unlinkedSummary(1, [{ tag: "a", text: "", index: 0 }]), `1 unlinked control: "<a>"`);
});

test("coverageOf: ratio, and 1 with no controls", () => {
  assert.deepEqual(coverageOf([scanControls(`<button data-to="a">a</button><button>b</button><button>c</button>`), scanControls("<p>x</p>")]), { screens: 2, controls: 3, linked: 1, unlinked: 2, ratio: 0.33 });
  assert.equal(coverageOf([]).ratio, 1);
});

test("validateScreens: unlinked_control warning per screen, in the warning group", () => {
  const issues = validateScreens([{ id: "a", html: `<button data-to="b">go</button><button>Nowhere</button>` }, { id: "b", html: `<a data-back>back</a>` }], "a");
  const w = issues.filter((i) => i.kind === "unlinked_control");
  assert.equal(w.length, 1);
  assert.equal(w[0]!.severity, "warning");
  assert.equal(w[0]!.screen, "a");
  assert.match(w[0]!.message, /1 unlinked control: "Nowhere"/);
});

const withCanvas = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "p", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "p", { name: "Main" }, 10);
  return sql;
};

test("set_screen, set_screens and patch_screen warn; validate_flow returns coverage and stays ok", () => {
  const sql = withCanvas();
  const r = setScreen(sql, "p", { canvas: "main", name: "Home", id: "home", width: 400, height: 300, html: `<button data-to="x">Go</button><button>Dead</button>` });
  assert.ok(r.warnings.includes(`1 unlinked control: "Dead"`));
  const many = setScreens(sql, "p", "main", [{ id: "x", name: "X", width: 400, height: 300, html: `<a data-back>B</a><button>One</button><button data-inert>Two</button>` }]);
  assert.deepEqual(many.screens[0]!.warnings, [`1 unlinked control: "One"`]);
  const v = validateFlow(sql, "p", "main");
  assert.equal(v.ok, true);
  assert.deepEqual(v.coverage, { screens: 2, controls: 4, linked: 2, unlinked: 2, ratio: 0.5 });
  assert.equal(v.issues.filter((i) => i.kind === "unlinked_control").length, 2);
  const p = patchScreen(sql, "p", "main", "home", [{ find: "<button>Dead</button>", replace: `<button data-back>Dead</button>` }]);
  assert.deepEqual(p.warnings, []);
});

test("web predicate: same decision as the scan, with ancestors", () => {
  assert.ok(isUnlinkedControl("BUTTON", attrs({})));
  assert.ok(!isUnlinkedControl("button", attrs({ "data-to": "a" })));
  assert.ok(!isUnlinkedControl("button", attrs({}), [attrs({}), attrs({ "data-back": "" })]));
  assert.ok(!isUnlinkedControl("button", attrs({}), [attrs({ "data-inert": "" })]));
  assert.ok(!isUnlinkedControl("div", attrs({})));
  assert.ok(isUnlinkedControl("div", attrs({ style: "cursor:pointer" })));
  assert.ok(isControlLike("DIV", attrs({ role: "Tab" })));
  for (const t of ["button", "a", "input", "select", "summary", "[role]", "[tabindex]", "[style]"]) assert.ok(UNLINKED_SELECTOR.includes(t));
});
