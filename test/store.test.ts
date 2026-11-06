import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const fresh = () => {
  const sql = nodeSql();
  migrate(sql);
  return sql;
};

test("migrating twice is a no-op", () => {
  const f = join(mkdtempSync(join(tmpdir(), "lite-db-")), "lite.db");
  const a = nodeSql(f);
  migrate(a);
  a.close();
  const b = nodeSql(f);
  migrate(b);
  assert.equal(b.all<{ c: number }>("SELECT count(*) AS c FROM _migrations")[0].c, 1);
  b.close();
});

test("events read back in order, after a seq, with payloads intact", () => {
  const sql = fresh();
  const a = appendEvent(sql, { kind: "ping", payload: { n: 1 } }, 100);
  const b = appendEvent(sql, { kind: "ping", payload: { n: 2 } }, 101);
  assert.ok(b.seq > a.seq);
  assert.deepEqual(eventsAfter(sql).map((e) => e.payload), [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(eventsAfter(sql, a.seq).map((e) => e.seq), [b.seq]);
  assert.equal(eventsAfter(sql, b.seq).length, 0);
});

test("events are append-only", () => {
  const sql = fresh();
  const e = appendEvent(sql, { kind: "ping" });
  assert.throws(() => sql.run("UPDATE events SET kind = 'x' WHERE seq = ?", e.seq), /append-only/);
  assert.throws(() => sql.run("DELETE FROM events WHERE seq = ?", e.seq), /append-only/);
});

test("an event for an unknown project is refused; project ids cannot escape", () => {
  const sql = fresh();
  assert.throws(() => appendEvent(sql, { project: "nope", kind: "x" }), /FOREIGN KEY/);
  const ins = (id: string) => sql.run("INSERT INTO projects (id, name, path, kind, opened_at) VALUES (?, 'n', ?, 'k', 0)", id, `/p/${id}`);
  for (const bad of ["", "..", "../x", "A", "-x", "a b", "x".repeat(41)]) assert.throws(() => ins(bad), /CHECK/, bad);
  ins("tvdash");
  assert.equal(appendEvent(sql, { project: "tvdash", kind: "x" }).project, "tvdash");
});

test("a database written by a newer build is refused", () => {
  const sql = nodeSql();
  migrate(sql);
  sql.run("INSERT INTO _migrations (version) VALUES (99)");
  assert.throws(() => migrate(sql), /version 99/);
});
