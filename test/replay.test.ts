import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asScreens, clock, createdScreens, describeAt, describeFloor, describeTimeline, replayEvents, eventLabel, indexAtSeq, indexFromFraction, justAdded, MAX_GAP_MS, MIN_GAP_MS,
  playStart, replayKey, stepDelay, stepIndex, tickNames, tickPositions, totalDuration, type TimelineEvent,
} from "../web/replay.ts";

const ev = (seq: number, ts: number, kind: string, screen: string | null = null, name: string | null = null): TimelineEvent => ({ seq, ts, kind, screen, name });
const events = [
  ev(12, 1000, "canvas.created"),
  ev(13, 1200, "screen.set", "home", "Home"),
  ev(15, 60_000, "screen.set", "home", "Home"),
  ev(16, 60_100, "screen.set", "about", "About"),
  ev(20, 400_000, "screen.removed", "home", "Home"),
  ev(21, 400_500, "screen.set", "home", "Home"),
];

test("describeTimeline shapes and sorts, tolerating gaps", () => {
  assert.deepEqual(describeTimeline(null), []);
  assert.deepEqual(describeTimeline({ events: [{ seq: 2, ts: 5, kind: "screen.set", screen: "a", name: "A" }, { seq: 1, ts: "x", kind: 7 }] }), [ev(1, 0, ""), ev(2, 5, "screen.set", "a", "A")]);
});

test("describeAt keeps layout as the box and asScreens feeds the frame diff", () => {
  const at = describeAt({ seq: 13, screens: [{ id: "home", name: "Home", width: 400, height: 300, seq: 13, html: "<p>hi</p>", layout: { x: 160, y: 0 } }, {}] });
  assert.equal(at.seq, 13);
  assert.deepEqual(at.screens[0].box, { id: "home", x: 160, y: 0, w: 400, h: 300 });
  const [s] = asScreens(at);
  assert.equal(s.updated_at, 13);
  assert.equal(s.html, "<p>hi</p>");
  assert.equal(describeAt(undefined).screens.length, 0);
});

test("indexAtSeq finds the last event at or before a seq", () => {
  assert.equal(indexAtSeq(events, 11), -1);
  assert.equal(indexAtSeq(events, 12), 0);
  assert.equal(indexAtSeq(events, 14), 1);
  assert.equal(indexAtSeq(events, 999), 5);
  assert.equal(indexAtSeq([], 5), -1);
});

test("stepIndex clamps at both ends", () => {
  assert.equal(stepIndex(0, 6, -1), 0);
  assert.equal(stepIndex(5, 6, 1), 5);
  assert.equal(stepIndex(2, 6, 1), 3);
  assert.equal(stepIndex(2, 6, -1), 1);
  assert.equal(stepIndex(0, 0, 1), 0);
});

test("scrubber fractions and ticks", () => {
  assert.equal(indexFromFraction(0, 6), 0);
  assert.equal(indexFromFraction(1, 6), 5);
  assert.equal(indexFromFraction(0.5, 5), 2);
  assert.equal(indexFromFraction(-3, 6), 0);
  assert.equal(indexFromFraction(NaN, 6), 0);
  assert.equal(indexFromFraction(0.7, 1), 0);
  assert.deepEqual(tickPositions(5), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(tickPositions(1), [0.5]);
  assert.deepEqual(tickPositions(0), []);
});

test("created screens: first set of an id, again after a removal; a re-set is not creation", () => {
  const c = createdScreens(events);
  assert.deepEqual(c.map((x) => x?.id ?? null), [null, "home", null, "about", null, "home"]);
  assert.deepEqual(tickNames(events), [{ index: 1, name: "Home" }, { index: 3, name: "About" }, { index: 5, name: "Home" }]);
  assert.equal(justAdded(events, 3), "about");
  assert.equal(justAdded(events, 2), null);
  assert.equal(justAdded(events, 99), null);
  assert.equal(justAdded(events, -1), null);
});

test("labels", () => {
  const ts = Date.UTC(2026, 10, 6, 14, 5);
  assert.equal(clock(ts, 0), "14:05");
  assert.equal(clock(ts, -60), "15:05");
  assert.equal(clock(ts, 300), "09:05");
  assert.equal(eventLabel(2, 12, ts, 0), "Event 3 of 12 · 14:05");
  assert.equal(eventLabel(0, 0, null), "Event 0 of 0");
  assert.equal(eventLabel(1, 4, null), "Event 2 of 4");
});

test("stepDelay follows recorded gaps, capped, floored and scaled by speed", () => {
  assert.equal(stepDelay(events, 0, 1), MIN_GAP_MS); // 200 ms gap floored
  assert.equal(stepDelay(events, 1, 1), MAX_GAP_MS); // ~59 s capped
  assert.equal(stepDelay(events, 2, 1), MIN_GAP_MS);
  assert.equal(stepDelay(events, 1, 2), MAX_GAP_MS / 2);
  assert.equal(stepDelay(events, 1, 0.5), MAX_GAP_MS * 2);
  const mid = [ev(1, 0, "a"), ev(2, 800, "b")];
  assert.equal(stepDelay(mid, 0, 1), 800);
  assert.equal(stepDelay(mid, 0, 2), 400);
  assert.equal(stepDelay(events, 5, 1), null);
  assert.equal(stepDelay(events, -1, 1), null);
  assert.equal(stepDelay([ev(1, 5, "a"), ev(2, 1, "b")], 0, 1), MIN_GAP_MS); // clock went backwards
});

test("a long session plays in under a minute at 1x", () => {
  const many = Array.from({ length: 30 }, (_, i) => ev(i + 1, i * 3_600_000, "screen.set", `s${i}`, "S"));
  assert.ok(totalDuration(many, 1) <= 29 * MAX_GAP_MS);
  assert.equal(totalDuration(many, 2), totalDuration(many, 1) / 2);
  assert.equal(totalDuration([], 1), 0);
});

test("playStart restarts at the end", () => {
  assert.equal(playStart(5, 6), 0);
  assert.equal(playStart(2, 6), 2);
  assert.equal(playStart(0, 0), 0);
});

test("replayKey maps the bar's shortcuts", () => {
  assert.equal(replayKey("ArrowLeft"), "prev");
  assert.equal(replayKey("ArrowRight"), "next");
  assert.equal(replayKey(" "), "toggle");
  assert.equal(replayKey("Escape"), "exit");
  assert.equal(replayKey("a"), null);
});

test("describeFloor and replayEvents: the scrubber starts at the first event at or after the floor", () => {
  assert.equal(describeFloor(null), 0);
  assert.equal(describeFloor({ floor: "x" }), 0);
  assert.equal(describeFloor({ floor: -3 }), 0);
  assert.equal(describeFloor({ floor: 14 }), 14);
  assert.deepEqual(replayEvents(events, 0), events);
  assert.deepEqual(replayEvents(events, 14).map((e) => e.seq), events.filter((e) => e.seq >= 14).map((e) => e.seq));
  assert.equal(replayEvents(events, 15)[0].seq, 15, "a floor on an event starts there");
  assert.deepEqual(replayEvents(events, 1e9), []);
});
