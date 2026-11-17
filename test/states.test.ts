import { test } from "node:test";
import assert from "node:assert/strict";
import { stateText } from "../web/states.ts";

test("state words name the subject and only loading has no hint", () => {
  assert.equal(stateText("loading", "design").title, "Loading the design…");
  assert.equal(stateText("loading", "design").hint, "");
  assert.equal(stateText("empty", "design system").title, "No design system yet");
  assert.equal(stateText("missing", "design").title, "This design does not exist");
  assert.match(stateText("error", "design").hint, /try again/);
});
