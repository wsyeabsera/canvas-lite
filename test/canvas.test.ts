import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agoText, canvasEvent, describeCanvasDetail, describeCanvasList, diffScreens, dropCanvas, iframeSpec, prevNext, refetchPlan, screensLabel, stepScreen, writingText, type Pending, type Screen, type Shown } from "../web/canvas.ts";
import { parseRoute, visibleRows, addRow, initialState, routeProject } from "../web/state.ts";
import { detail } from "../cli/format.ts";

const scr = (id: string, updated_at: number, w = 1920, h = 1080): Screen => ({ id, name: id.toUpperCase(), width: w, height: h, x: null, y: null, updated_at, html: "<p>x</p>" });

test("parseRoute handles canvas and screen routes and validates every id", () => {
  assert.deepEqual(parseRoute("#/project/tv/canvas/main"), { view: "canvas", id: "tv", canvas: "main" });
  assert.deepEqual(parseRoute("#/project/tv/canvas/main/screen/home-1"), { view: "screen", id: "tv", canvas: "main", screen: "home-1" });
  for (const bad of ["#/project/tv/canvas", "#/project/tv/canvas/", "#/project/tv/canvas/Main", "#/project/tv/canvas/-x", "#/project/tv/canvas/a/screen", "#/project/tv/canvas/a/screen/B", "#/project/tv/canvas/a/screen/a/b", "#/project/tv/screen/a", "#/project/TV/canvas/a", `#/project/tv/canvas/${"a".repeat(41)}`, "#/project/tv/canvas/a_b"])
    assert.deepEqual(parseRoute(bad), { view: "activity" }, bad);
  assert.equal(routeProject(parseRoute("#/project/tv/canvas/main")), "tv");
  assert.equal(routeProject(parseRoute("#/")), null);
});

test("visibleRows filters by project on canvas routes", () => {
  const s = [1, 2, 3].reduce((st, n) => addRow(st, { seq: n, project: n === 2 ? "b" : "a", kind: "ping", payload: {}, ts: n }), initialState());
  assert.deepEqual(visibleRows(s, { view: "canvas", id: "a", canvas: "c" }).map((r) => r.seq), [1, 3]);
});

test("canvas events get a one-line detail", () => {
  assert.equal(detail({ kind: "canvas.created", payload: { canvas: "main", name: "TV screens" } }), "created canvas TV screens");
  assert.equal(detail({ kind: "screen.set", payload: { canvas: "main", id: "home", name: "Home", width: 1, height: 1, bytes: 9, created: true } }), "set Home in main");
  assert.equal(detail({ kind: "screen.removed", payload: { canvas: "main", id: "home", name: "Home" } }), "removed Home from main");
  assert.equal(detail({ kind: "canvas.removed", payload: { canvas: "main", name: "TV screens" } }), "removed canvas TV screens");
  assert.equal(detail({ kind: "screen.set", payload: { weird: 1 } }), '{"weird":1}');
  assert.equal(detail({ kind: "screen.set", payload: { canvas: "m", name: "x".repeat(300) } }).length, 100);
});

test("describeCanvasList sorts newest first and tolerates gaps", () => {
  const l = describeCanvasList({ canvases: [{ id: "a", name: "A", screens: 1, updated_at: 1 }, { id: "b", name: "B", screens: 2, updated_at: 5 }, { nope: 1 }, { id: "c" }] });
  assert.deepEqual(l.map((c) => c.id), ["b", "a", "c"]);
  assert.deepEqual(describeCanvasList(null), []);
  assert.equal(l[2]!.name, "c");
});

test("describeCanvasDetail keeps order, drops bad screens", () => {
  const d = describeCanvasDetail({ canvas: { id: "m", name: "M", created_at: 1, updated_at: 2 }, screens: [{ id: "b", name: "B", width: 10, height: 5, updated_at: 3, html: "<i>" }, { id: "a", width: 0, height: 5 }, { id: "c", width: 4, height: 4 }] });
  assert.deepEqual(d!.screens.map((s) => s.id), ["b", "c"]);
  assert.equal(d!.canvas.screens, 2);
  assert.equal(describeCanvasDetail({}), null);
});

test("agoText with an injected clock", () => {
  const now = 10_000_000_000;
  assert.equal(agoText(now - 5_000, now), "just now");
  assert.equal(agoText(now + 5_000, now), "just now");
  assert.equal(agoText(now - 120_000, now), "2 min ago");
  assert.equal(agoText(now - 3 * 3600_000, now), "3 h ago");
  assert.equal(agoText(now - 30 * 3600_000, now), "yesterday");
  assert.equal(agoText(now - 5 * 86400_000, now), "5 days ago");
  assert.equal(screensLabel(0), "no screens");
  assert.equal(screensLabel(1), "1 screen");
  assert.equal(screensLabel(5), "5 screens");
});

test("diffScreens: only new, moved and html-changed frames are touched", () => {
  const shown = new Map<string, Shown>([["a", { updated_at: 1, html: "<p>x</p>" }], ["b", { updated_at: 2, html: "<p>x</p>" }], ["old", { updated_at: 1, html: "" }]]);
  const next = [scr("a", 1), { ...scr("b", 3), html: "<p>new</p>" }, scr("c", 4)];
  assert.deepEqual(diffScreens(shown, next), { add: ["c"], changed: ["b"], html: ["b"], remove: ["old"] });
  const same = diffScreens(new Map([["a", { updated_at: 1, html: "<p>x</p>" }]]), [scr("a", 1)]);
  assert.deepEqual(same, { add: [], changed: [], html: [], remove: [] });
  const renamed = diffScreens(new Map([["a", { updated_at: 1, html: "<p>x</p>" }]]), [scr("a", 2)]);
  assert.deepEqual([renamed.changed, renamed.html], [["a"], []]); // a rename or resize keeps the iframe's document
});

test("prev/next and arrow-key stepping", () => {
  const ss = [scr("a", 5), scr("b", 9), scr("c", 9), scr("d", 1)];
  const n = prevNext(ss, "a")!;
  assert.equal(n.prev, null);
  assert.equal(n.next!.id, "b");
  assert.deepEqual([n.index, n.total], [1, 4]);
  const e = prevNext(ss, "d")!;
  assert.equal(e.next, null);
  assert.equal(e.prev!.id, "c");
  assert.equal(prevNext(ss, "zz"), null);
  assert.equal(stepScreen(ss, null, 1), "a");
  assert.equal(stepScreen(ss, null, -1), "d");
  assert.equal(stepScreen(ss, "b", 1), "c");
  assert.equal(stepScreen(ss, "b", -1), "a");
  assert.equal(stepScreen(ss, "d", 1), "d");
  assert.equal(stepScreen(ss, "a", -1), "a");
  assert.equal(stepScreen(ss, "zz", 1), "a");
  assert.equal(stepScreen([], null, 1), null);
});

test("describeCanvasDetail reads placement, null when absent", () => {
  const d = describeCanvasDetail({ canvas: { id: "m" }, screens: [{ id: "a", width: 10, height: 10, x: 40, y: -20 }, { id: "b", width: 10, height: 10, x: null }, { id: "c", width: 10, height: 10, x: "1", y: 2 }] })!;
  assert.deepEqual(d.screens.map((s) => [s.x, s.y]), [[40, -20], [null, null], [null, 2]]);
});

test("iframeSpec is a sandboxed srcdoc frame", () => {
  const spec = iframeSpec({ name: "Home", width: 400, height: 300, html: "<script>alert(1)</script>" });
  assert.equal(spec.sandbox, "");
  assert.equal(spec.referrerpolicy, "no-referrer");
  assert.equal(spec.loading, "lazy");
  assert.equal(spec.title, "Home");
  assert.equal(spec.srcdoc, "<script>alert(1)</script>");
  assert.deepEqual([spec.width, spec.height], [400, 300]);
});

test("writingText names the screen Claude is writing, or counts them", () => {
  assert.equal(writingText(new Map()), null);
  assert.equal(writingText(new Map<string, Pending>([["b", { name: "Home", width: 5, height: 6, at: 1 }]])), "Claude is writing Home…");
  assert.equal(writingText(new Map<string, Pending>([["b", { name: "B", width: 5, height: 6, at: 1 }], ["z", { name: "Z", width: 7, height: 8, at: 2 }]])), "Claude is writing 2 screens…");
});

test("refetchPlan: only the current project, detail only for the open canvas", () => {
  const ev = (kind: string, project: string, canvas: string) => ({ kind, project, payload: { canvas, name: "n", id: "s" } });
  const cv = { view: "canvas", id: "p", canvas: "c" } as const;
  assert.deepEqual(refetchPlan(cv, ev("screen.set", "p", "c")), { list: true, detail: true });
  assert.deepEqual(refetchPlan(cv, ev("screen.set", "p", "other")), { list: true, detail: false });
  assert.deepEqual(refetchPlan(cv, ev("screen.set", "q", "c")), { list: false, detail: false });
  assert.deepEqual(refetchPlan({ view: "project", id: "p" }, ev("canvas.created", "p", "c")), { list: true, detail: false });
  assert.deepEqual(refetchPlan({ view: "activity" }, ev("canvas.removed", "p", "c")), { list: false, detail: false });
  assert.deepEqual(refetchPlan({ view: "screen", id: "p", canvas: "c", screen: "s" }, ev("screen.removed", "p", "c")), { list: true, detail: true });
  assert.deepEqual(refetchPlan(cv, { kind: "ping", project: "p", payload: {} }), { list: false, detail: false });
  assert.equal(canvasEvent({ kind: "screen.set", payload: {} }), null);
  assert.deepEqual(dropCanvas([{ id: "a", name: "A", screens: 0, updated_at: 0 }, { id: "b", name: "B", screens: 0, updated_at: 0 }], "a").map((c) => c.id), ["b"]);
});

test("public/_headers carries a tight CSP", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "public", "_headers"), "utf8");
  const blocks = text.split(/\n(?=\S)/).map((b) => b.trim().split("\n"));
  assert.ok(blocks.some((b) => b[0] === "/"));
  for (const [path, ...lines] of blocks) {
    const h = Object.fromEntries(lines.map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
    const csp: string = h["Content-Security-Policy"]!;
    assert.ok(csp, path);
    const d = Object.fromEntries(csp.split(";").map((x) => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(" ")]));
    assert.equal(d["default-src"], "'none'");
    assert.equal(d["script-src"], "'self'");
    assert.ok(!/unsafe-inline|unsafe-eval/.test(d["script-src"]!));
    assert.ok(csp.includes("img-src data: https:"));
    assert.equal(d["base-uri"], "'none'");
    assert.equal(d["form-action"], "'none'");
    assert.equal(d["frame-src"], "'self'");
    assert.equal(h["X-Content-Type-Options"], "nosniff");
    assert.equal(h["Referrer-Policy"], "no-referrer");
  }
});
