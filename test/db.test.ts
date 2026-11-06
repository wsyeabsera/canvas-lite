import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, defaultDbFile, eventsAfter, openDb } from "../src/db.ts";

const tmpDb = () => join(mkdtempSync(join(tmpdir(), "lite-db-")), "lite.db");

test("a fresh db is created and reopening it is a no-op", () => {
  const f = tmpDb();
  openDb(f).close();
  const db = openDb(f);
  assert.equal((db.prepare("PRAGMA user_version").get() as any).user_version, 1);
  db.close();
});

test("events read back in order, after a seq, with payloads intact", () => {
  const db = openDb(":memory:");
  const a = appendEvent(db, { kind: "ping", payload: { n: 1 } }, 100);
  const b = appendEvent(db, { kind: "ping", payload: { n: 2 } }, 101);
  assert.ok(b.seq > a.seq);
  assert.deepEqual(eventsAfter(db).map((e) => e.payload), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(eventsAfter(db, a.seq).map((e) => e.seq), [b.seq]);
  assert.equal(eventsAfter(db, b.seq).length, 0);
});

test("events are append-only", () => {
  const db = openDb(":memory:");
  const e = appendEvent(db, { kind: "ping" });
  assert.throws(() => db.prepare("UPDATE events SET kind = 'x' WHERE seq = ?").run(e.seq), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM events WHERE seq = ?").run(e.seq), /append-only/);
});

test("an event for an unknown project is refused; project ids cannot escape", () => {
  const db = openDb(":memory:");
  assert.throws(() => appendEvent(db, { project: "nope", kind: "x" }), /FOREIGN KEY/);
  const ins = db.prepare("INSERT INTO projects (id, name, path, kind, opened_at) VALUES (?, 'n', ?, 'k', 0)");
  for (const bad of ["", "..", "../x", "A", "-x", "a b", "x".repeat(41)]) assert.throws(() => ins.run(bad, `/p/${bad}`), /CHECK/, bad);
  ins.run("tvdash", "/p/tvdash");
  assert.equal(appendEvent(db, { project: "tvdash", kind: "x" }).project, "tvdash");
});

test("a database from a newer build is refused", () => {
  const f = tmpDb();
  const db = openDb(f);
  db.exec("PRAGMA user_version = 99");
  db.close();
  assert.throws(() => openDb(f), /version 99/);
});

test("LITE_HOME moves the default db file", () => {
  assert.equal(defaultDbFile({ LITE_HOME: "/x" }), "/x/lite.db");
});
