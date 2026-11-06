import { test } from "node:test";
import assert from "node:assert/strict";
import { hasWebGPU, mixHex, parseTheme, shouldRun, shouldShow, themeColors } from "../web/backdrop.ts";

test("hasWebGPU needs navigator.gpu with requestAdapter", () => {
  assert.equal(hasWebGPU({ gpu: { requestAdapter: () => null } }), true);
  for (const nav of [undefined, null, {}, { gpu: undefined }, { gpu: null }, { gpu: {} }, { gpu: { requestAdapter: 1 } }, { gpu: "yes" }]) {
    assert.equal(hasWebGPU(nav as never), false, JSON.stringify(nav));
  }
});

test("hasWebGPU treats a throwing getter as no WebGPU", () => {
  const nav = Object.defineProperty({}, "gpu", { get: () => { throw new Error("blocked"); } });
  assert.equal(hasWebGPU(nav), false);
});

test("shouldRun animates only when visible, off the canvas and with motion allowed", () => {
  assert.equal(shouldRun({ hidden: false, canvasMode: false, reducedMotion: false }), true);
  assert.equal(shouldRun({ hidden: true, canvasMode: false, reducedMotion: false }), false);
  assert.equal(shouldRun({ hidden: false, canvasMode: true, reducedMotion: false }), false);
  assert.equal(shouldRun({ hidden: false, canvasMode: false, reducedMotion: true }), false);
});

test("shouldShow hides the backdrop in canvas mode only", () => {
  assert.equal(shouldShow({ canvasMode: false }), true);
  assert.equal(shouldShow({ canvasMode: true }), false);
});

test("mixHex blends a colour over a base at an alpha", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
  assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#0a0c13", "#6366f1", 0.42), "#2f3270");
});

test("themeColors follows the theme's base and stays within the mesh's 8 stops", () => {
  const dark = themeColors("dark");
  const light = themeColors("light");
  assert.equal(dark.base, "#0a0c13");
  assert.equal(light.base, "#eef1f9");
  for (const c of [dark, light]) {
    assert.ok(c.stops.length >= 2 && c.stops.length <= 8);
    assert.equal(c.stops[0]!.position, 0);
    assert.equal(c.stops.at(-1)!.position, 1);
    for (const s of c.stops) assert.match(s.color, /^#[0-9a-f]{6}$/);
    const positions = c.stops.map((s) => s.position);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
  assert.notDeepEqual(dark.stops, light.stops);
});

test("themeColors keeps dark blobs dark and light blobs light (calm, like the CSS gradient)", () => {
  const lum = (h: string) => (parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)) / 3;
  for (const s of themeColors("dark").stops) assert.ok(lum(s.color) < 110, s.color);
  for (const s of themeColors("light").stops) assert.ok(lum(s.color) > 150, s.color);
});

test("parseTheme: only 'light' is light", () => {
  assert.equal(parseTheme("light"), "light");
  for (const raw of ["dark", undefined, null, "", "auto"]) assert.equal(parseTheme(raw), "dark");
});
