import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMs, normalizeUrl, Watcher, type SocketLike } from "../cli/watch-core.ts";

test("normalizeUrl", () => {
  assert.equal(normalizeUrl(undefined), "ws://127.0.0.1:8790/events");
  assert.equal(normalizeUrl("http://h.dev"), "ws://h.dev/events");
  assert.equal(normalizeUrl("https://h.dev/"), "wss://h.dev/events");
  assert.equal(normalizeUrl("https://h.dev/custom"), "wss://h.dev/custom");
  assert.equal(normalizeUrl("ws://h:1/events"), "ws://h:1/events");
  assert.throws(() => normalizeUrl("ftp://x"));
});

test("backoff doubles from 500ms to a 10s cap", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(backoffMs), [500, 1000, 2000, 4000, 8000, 10000, 10000, 10000]);
});

class FakeWS implements SocketLike {
  static all: FakeWS[] = [];
  sent: string[] = [];
  closed = false;
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
  msg(o: unknown) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
}

function setup(opts: { token?: string; after?: number } = {}) {
  FakeWS.all = [];
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const rows: number[] = [];
  const status: string[] = [];
  let refused = 0;
  const w = new Watcher({
    url: "ws://x/events",
    ...opts,
    WebSocket: FakeWS,
    setTimer: (fn, ms) => timers.push({ fn, ms, live: true }) - 1,
    clearTimer: (h) => void (timers[h as number].live = false),
    onRow: (r) => rows.push(r.seq),
    onStatus: (s) => status.push(s),
    onRefused: () => refused++,
  });
  w.start();
  return { w, timers, rows, status, refused: () => refused, sock: () => FakeWS.all.at(-1)! };
}
const row = (seq: number) => ({ seq, project: null, kind: "ping", payload: {}, ts: 0 });

test("sends exactly one hello, omitting a missing token", () => {
  const t = setup();
  t.sock().onopen?.({});
  assert.deepEqual(t.sock().sent, ['{"hello":{"after":0}}']);
  const t2 = setup({ token: "s", after: 5 });
  t2.sock().onopen?.({});
  assert.deepEqual(t2.sock().sent.map((s) => JSON.parse(s)), [{ hello: { token: "s", after: 5 } }]);
});

test("skips rows already seen and counts them", () => {
  const t = setup({ after: 2 });
  t.sock().onopen?.({});
  for (const s of [1, 2, 3, 3, 4, 2]) t.sock().msg(row(s));
  assert.deepEqual(t.rows, [3, 4]);
  assert.equal(t.w.skipped, 4);
  assert.equal(t.w.lastSeq, 4);
});

test("reconnects with backoff, resends hello with last seq, resets after a message", () => {
  const t = setup();
  t.sock().onopen?.({});
  t.sock().msg(row(9));
  const first = t.sock();
  first.onerror?.({});
  first.onclose?.({ code: 1006 }); // error + close: one retry only
  assert.equal(t.timers.length, 1);
  assert.equal(t.timers[0].ms, 500);
  t.timers[0].fn();
  t.sock().onclose?.({ code: 1006 });
  assert.equal(t.timers[1].ms, 1000);
  t.timers[1].fn();
  assert.equal(FakeWS.all.length, 3);
  t.sock().onopen?.({});
  assert.deepEqual(JSON.parse(t.sock().sent[0]), { hello: { after: 9 } });
  t.sock().msg(row(10));
  t.sock().onclose?.({ code: 1006 });
  assert.equal(t.timers[2].ms, 500);
  assert.deepEqual(t.status.filter((s) => s.startsWith("disc")), [
    "disconnected, retrying in 0.5s",
    "disconnected, retrying in 1s",
    "disconnected, retrying in 0.5s",
  ]);
});

test("1008 is refused: no retry", () => {
  const t = setup();
  t.sock().onclose?.({ code: 1008 });
  assert.equal(t.refused(), 1);
  assert.equal(t.timers.length, 0);
  assert.ok(t.status.includes("refused: check LITE_TOKEN"));
});

test("stop cancels the pending retry", () => {
  const t = setup();
  t.sock().onclose?.({ code: 1006 });
  t.w.stop();
  assert.equal(t.timers[0].live, false);
});
