import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPng, checkShotId, ShotBroker, SHOT_B64_MAX, type Timers } from "../src/screen-image.ts";
import { shotIsFresh, shotSize, shotSvg, SHOT_FRESH_MS } from "../web/screen-shot.ts";
import { routeApi } from "../src/api.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let n = 0;
  const timers: Timers = { set: (fn) => (pending.set(++n, fn), n), clear: (h) => void pending.delete(h as number) };
  return { timers, fire: () => [...pending.values()].forEach((f) => f()), count: () => pending.size };
}

test("checkPng accepts a PNG and refuses everything else", () => {
  assert.equal(checkPng(PNG), PNG);
  assert.throws(() => checkPng(""), /base64 text/);
  assert.throws(() => checkPng(42), /base64 text/);
  assert.throws(() => checkPng(Buffer.from("GIF89a....").toString("base64")), /PNG/);
  assert.throws(() => checkPng(PNG + "!!"), /PNG/);
  assert.throws(() => checkPng(PNG + "A".repeat(SHOT_B64_MAX)), /too large/);
});

test("checkShotId", () => {
  assert.equal(checkShotId("0f8fad5b-d9cb-469f"), "0f8fad5b-d9cb-469f");
  assert.throws(() => checkShotId("../x"), /invalid/);
  assert.throws(() => checkShotId("short"), /invalid/);
});

test("broker: deliver resolves the waiter once and clears the timer", async () => {
  const f = fakeTimers();
  const b = new ShotBroker(f.timers);
  const p = b.wait("request-1");
  assert.equal(b.size, 1);
  assert.equal(b.deliver("request-1", PNG), true);
  assert.equal(await p, PNG);
  assert.equal(b.deliver("request-1", PNG), false, "second answer is refused");
  assert.equal(f.count(), 0);
  assert.equal(b.size, 0);
});

test("broker: no answer rejects with what to do, and a late answer is refused", async () => {
  const f = fakeTimers();
  const b = new ShotBroker(f.timers);
  const p = b.wait("request-2", 15_000);
  f.fire();
  await assert.rejects(p, /open the project's watch page/);
  assert.equal(b.deliver("request-2", PNG), false);
});

test("broker: unknown request is not delivered", () => {
  assert.equal(new ShotBroker(fakeTimers().timers).deliver("nobody-1234", PNG), false);
});

test("routeApi: POST /shots/<request> only", () => {
  assert.deepEqual(routeApi("POST", "/api/projects/tvdash/shots/0f8fad5b-d9cb-469f"), { kind: "shot", id: "tvdash", request: "0f8fad5b-d9cb-469f" });
  assert.equal((routeApi("GET", "/api/projects/tvdash/shots/0f8fad5b-d9cb-469f") as any).status, 405);
  assert.equal((routeApi("POST", "/api/projects/tvdash/shots/x") as any).status, 400);
  assert.equal((routeApi("POST", "/api/projects/tvdash/shots") as any).status, 400);
});

test("page side: freshness, size cap, svg wrapper", () => {
  assert.equal(shotIsFresh(1000, 1000 + SHOT_FRESH_MS), true);
  assert.equal(shotIsFresh(1000, 1001 + SHOT_FRESH_MS), false, "a replayed old request is ignored");
  assert.equal(shotIsFresh(10_000, 1000), false, "far in the future is not live either");
  assert.deepEqual(shotSize(800, 600), { width: 800, height: 600, scale: 1 });
  assert.deepEqual(shotSize(3200, 1600), { width: 1600, height: 800, scale: 0.5 });
  assert.match(shotSvg("<html/>", 10, 20), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="10" height="20"><foreignObject .*<html\/><\/foreignObject><\/svg>$/);
});
