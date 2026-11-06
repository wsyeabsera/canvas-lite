import { test } from "node:test";
import assert from "node:assert/strict";
import { clip, formatEvent } from "../cli/format.ts";

const ts = new Date(2026, 0, 2, 3, 4, 5).getTime();
const row = (kind: string, payload: unknown, project: string | null = "p1", seq = 7) => ({ seq, project, kind, payload, ts });

test("ping shows the note", () => {
  assert.equal(formatEvent(row("ping", { note: "hi" }, null)), "03:04:05 #7 - ping hi");
  assert.equal(formatEvent(row("ping", {}, null)), "03:04:05 #7 - ping");
});

test("project.opened shows the name", () => {
  assert.equal(formatEvent(row("project.opened", { name: "Lite", manifest: { big: 1 } })), "03:04:05 #7 p1 project.opened opened Lite");
});

test("other kinds show compact JSON", () => {
  assert.equal(formatEvent(row("x", { a: 1, b: [2] })), '03:04:05 #7 p1 x {"a":1,"b":[2]}');
});

test("whitespace collapses and detail caps at 100 chars", () => {
  assert.equal(clip("a \n\t b"), "a b");
  const long = formatEvent(row("ping", { note: "x".repeat(500) }));
  const d = long.split(" ping ")[1];
  assert.equal(d.length, 100);
  assert.ok(d.endsWith("..."));
  assert.equal(clip("y".repeat(100)).length, 100);
  assert.ok(!clip("y".repeat(100)).endsWith("..."));
});

test("project.removed shows the removed name", () => {
  assert.equal(formatEvent({ seq: 5, project: "tvdash", kind: "project.removed", payload: { name: "tvdash" }, ts: 0 }).includes("removed tvdash"), true);
});
