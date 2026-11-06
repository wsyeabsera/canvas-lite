import { test } from "node:test";
import assert from "node:assert/strict";
import { buttonLabel, nextPref, parsePref, resolveTheme } from "../web/theme.ts";

test("parsePref accepts only the three choices", () => {
  for (const p of ["auto", "light", "dark"]) assert.equal(parsePref(p), p);
  for (const bad of [null, undefined, "", "Dark", "blue", 1, {}]) assert.equal(parsePref(bad), "auto");
});

test("nextPref cycles auto, light, dark, auto", () => {
  assert.equal(nextPref("auto"), "light");
  assert.equal(nextPref("light"), "dark");
  assert.equal(nextPref("dark"), "auto");
});

test("resolveTheme follows the system only for auto", () => {
  assert.equal(resolveTheme("auto", true), "dark");
  assert.equal(resolveTheme("auto", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("buttonLabel names the current choice", () => {
  assert.equal(buttonLabel("auto"), "Theme: auto");
  assert.equal(buttonLabel("dark"), "Theme: dark");
});
