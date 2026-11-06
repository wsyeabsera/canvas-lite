import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, removeScreen, setScreens } from "../src/canvases.ts";
import { FLOW_TEXT, readCanvasForPage, readFlow, reviewFlow } from "../src/flow.ts";
import { checkScenarios, linkControls, readScenarios, setScenarios, stepMove, validateScenarios, SCENARIOS_MAX, SCENARIO_STEPS_MAX } from "../src/scenarios.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const mk = (id: string, html: string) => ({ id, name: id, width: 400, height: 300, html });
const SCREENS = [
  mk("home", `<a data-to="cart">Open cart</a><a data-to="cart">Basket icon</a><button data-to="help">Help</button>`),
  mk("cart", `<a data-back>Back</a><button data-to="done"><b>Pay</b> now</button>`),
  mk("done", `<a data-to="home">Home</a>`),
  mk("help", `<a data-back>x</a>`),
];
const setup = (screens = SCREENS) => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createCanvas(sql, "tvdash", { name: "Main" }, 2);
  setScreens(sql, "tvdash", "main", screens, 3);
  return sql;
};
const st = (screen: string, extra: object = {}) => ({ screen, dwell_ms: 1000, ...extra });
const buy = { id: "buy", name: "Buy", steps: [st("home"), st("cart", { via: "basket", caption: "Open the basket" }), st("done")] };

test("linkControls: order, nested text, back, aria-label, comments ignored", () => {
  const c = linkControls(`<!-- <a data-to="x">no</a> --><a data-to="a"> Go  <i>there</i> </a><div data-back aria-label="Close"></div><button data-to="b" title="Hello"></button>`);
  assert.deepEqual(c, [
    { kind: "to", to: "a", text: "Go there" },
    { kind: "back", to: null, text: "Close" },
    { kind: "to", to: "b", text: "Hello" },
  ]);
});

test("stepMove: forward, back to the screen before, back to an older one, none", () => {
  const cs = linkControls(`<a data-back>b</a><a data-to="x">x</a>`);
  assert.equal(stepMove(["a", "b"], "x", cs), "to");
  assert.equal(stepMove(["a", "b"], "a", cs), "back");
  assert.equal(stepMove(["a", "b", "c"], "a", cs), "back");
  assert.equal(stepMove(["a", "b"], "zzz", cs), null);
  assert.equal(stepMove(["a", "b"], "a", linkControls(`<a data-to="x">x</a>`)), null);
});

test("checkScenarios: valid copy drops empty optional fields; limits and shapes throw", () => {
  const ok = checkScenarios([{ id: "a", name: "A", description: "", steps: [{ screen: "home", dwell_ms: 200, caption: "", via: "" }] }]);
  assert.deepEqual(ok, [{ id: "a", name: "A", steps: [{ screen: "home", dwell_ms: 200 }] }]);
  assert.deepEqual(checkScenarios([]), []);
  const one = (over: object) => [{ id: "a", name: "A", steps: [st("home")], ...over }];
  assert.throws(() => checkScenarios("x"), /invalid scenarios/);
  assert.throws(() => checkScenarios(Array.from({ length: SCENARIOS_MAX + 1 }, (_, i) => ({ id: `s${i}`, name: "x", steps: [st("a")] }))), /0 to 12 scenarios/);
  assert.throws(() => checkScenarios(one({ id: "Bad id" })), /invalid scenario 0: id "Bad id"/);
  assert.throws(() => checkScenarios([...one({}), ...one({})]), /duplicate id "a"/);
  assert.throws(() => checkScenarios(one({ name: "" })), /name must be 1 to 80/);
  assert.throws(() => checkScenarios(one({ name: "x".repeat(81) })), /name must be 1 to 80/);
  assert.throws(() => checkScenarios(one({ description: "x".repeat(201) })), /description/);
  assert.throws(() => checkScenarios(one({ steps: [] })), /1 to 40 steps/);
  assert.throws(() => checkScenarios(one({ steps: Array.from({ length: SCENARIO_STEPS_MAX + 1 }, () => st("a")) })), /1 to 40 steps/);
  assert.throws(() => checkScenarios(one({ steps: [st("a", { dwell_ms: 199 })] })), /scenario "a" step 0: dwell_ms/);
  assert.throws(() => checkScenarios(one({ steps: [st("a", { dwell_ms: 60001 })] })), /dwell_ms/);
  assert.throws(() => checkScenarios(one({ steps: [st("a", { caption: "x".repeat(201) })] })), /caption/);
  assert.throws(() => checkScenarios(one({ steps: [st("a", { via: "x".repeat(61) })] })), /via/);
  assert.throws(() => checkScenarios(one({ steps: [{ screen: 3, dwell_ms: 500 }] })), /screen must be a screen id/);
});

test("validateScenarios: missing screen, missing link, via mismatch name scenario, step and fix", () => {
  assert.doesNotThrow(() => validateScenarios([buy], SCREENS));
  assert.throws(() => validateScenarios([{ id: "x", name: "x", steps: [st("home"), st("ghost")] }], SCREENS), /scenario "x" step 1: unknown screen "ghost"/);
  assert.throws(
    () => validateScenarios([{ id: "x", name: "x", steps: [st("home"), st("cart"), st("help")] }], SCREENS),
    /scenario "x" step 2: no link from "cart" to "help": add data-to="help" to a control in "cart"/,
  );
  assert.throws(
    () => validateScenarios([{ id: "x", name: "x", steps: [st("home"), st("cart", { via: "checkout" })] }], SCREENS),
    /scenario "x" step 1: via "checkout" matches no link text in "home" that goes to "cart" \(found: "Open cart", "Basket icon"\)/,
  );
  // via is case-insensitive and may match nested text
  assert.doesNotThrow(() => validateScenarios([{ id: "x", name: "x", steps: [st("home"), st("cart"), st("done", { via: "PAY NOW" })] }], SCREENS));
});

test("validateScenarios: data-back returns to the previous or an earlier screen, then the stack shrinks", () => {
  const back = { id: "b", name: "b", steps: [st("home"), st("cart"), st("home", { via: "back" }), st("help")] };
  assert.doesNotThrow(() => validateScenarios([back], SCREENS));
  // done has no data-back: cannot return to cart
  assert.throws(() => validateScenarios([{ id: "n", name: "n", steps: [st("home"), st("cart"), st("done"), st("cart")] }], SCREENS), /step 3: no link from "done" to "cart"/);
  // after going back home, a second back has nowhere to go
  assert.throws(() => validateScenarios([{ id: "n", name: "n", steps: [st("home"), st("cart"), st("home"), st("cart"), st("home"), st("done")] }], SCREENS), /step 5: no link from "home" to "done"/);
});

test("setScenarios: stores one scenarios.set event, summary shape, replaces, clears", () => {
  const sql = setup();
  const r = setScenarios(sql, "tvdash", "main", [buy, { id: "help", name: "Help", description: "Get help", steps: [st("home", { dwell_ms: 500 }), st("help", { dwell_ms: 500 })] }], 10);
  assert.equal(r.event.kind, "scenarios.set");
  assert.deepEqual(r.event.payload, { canvas: "main", scenarios: [buy, { id: "help", name: "Help", description: "Get help", steps: [st("home", { dwell_ms: 500 }), st("help", { dwell_ms: 500 })] }] });
  assert.deepEqual(r.scenarios, [{ id: "buy", name: "Buy", steps: 3, duration_ms: 3000 }, { id: "help", name: "Help", steps: 2, duration_ms: 1000 }]);
  assert.equal(r.total_ms, 4000);
  assert.deepEqual(Object.keys(r).sort(), ["canvas", "event", "scenarios", "total_ms"]);
  assert.equal(readScenarios(sql, "tvdash", "main").length, 2);
  setScenarios(sql, "tvdash", "main", [buy], 11);
  assert.equal(readScenarios(sql, "tvdash", "main").length, 1);
  const c = setScenarios(sql, "tvdash", "main", [], 12);
  assert.deepEqual(c.scenarios, []);
  assert.equal(c.total_ms, 0);
  assert.deepEqual(readScenarios(sql, "tvdash", "main"), []);
});

test("setScenarios: errors write nothing; unknown project and canvas", () => {
  const sql = setup();
  assert.throws(() => setScenarios(sql, "tvdash", "main", [{ id: "x", name: "x", steps: [st("home"), st("help"), st("done")] }]), /step 2/);
  assert.deepEqual(readScenarios(sql, "tvdash", "main"), []);
  assert.throws(() => setScenarios(sql, "nope", "main", []), /unknown project/);
  assert.throws(() => setScenarios(sql, "tvdash", "ghost", []), /unknown canvas/);
});

test("end to end: read_flow and the page api carry scenarios with missing steps after a screen is removed; other canvases are separate", () => {
  const sql = setup();
  assert.deepEqual(readFlow(sql, "tvdash", "main").scenarios, []);
  setScenarios(sql, "tvdash", "main", [buy], 10);
  createCanvas(sql, "tvdash", { name: "Other" }, 11);
  assert.deepEqual(readScenarios(sql, "tvdash", "other"), []);
  const f = readFlow(sql, "tvdash", "main");
  assert.deepEqual(f.scenarios, [{ ...buy, duration_ms: 3000, missing: [] }]);
  assert.deepEqual(readCanvasForPage(sql, "tvdash", "main").scenarios, f.scenarios);
  removeScreen(sql, "tvdash", "main", "done");
  assert.deepEqual(readFlow(sql, "tvdash", "main").scenarios[0].missing, [2]);
});

test("review_prototype: scenarios count as coverage, no_scenarios at 4+ screens", () => {
  const sql = setup();
  const kinds = () => reviewFlow(sql, "tvdash", "main").issues.filter((i) => i.severity === "info").map((i) => `${i.kind}:${i.screen ?? ""}`);
  assert.ok(kinds().includes("no_scenarios:"));
  setScenarios(sql, "tvdash", "main", [buy], 10);
  assert.ok(!kinds().includes("no_scenarios:"));
  assert.ok(kinds().includes("scenario_skips_screen:help"));
  setScenarios(sql, "tvdash", "main", [buy, { id: "h", name: "h", steps: [st("home"), st("help")] }], 11);
  assert.ok(!kinds().some((k) => k.startsWith("scenario_skips_screen")));
  assert.equal(reviewFlow(sql, "tvdash", "main").stats.covered_screens, 4);
});

test("tool text tells Claude to write 2 to 4 scenarios with plain captions", () => {
  assert.match(FLOW_TEXT.set_scenarios, /2 TO 4 SCENARIOS/);
  assert.match(FLOW_TEXT.set_scenarios, /plain words/);
  assert.match(FLOW_TEXT.read_flow, /scenarios/);
});
