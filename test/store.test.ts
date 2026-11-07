import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, eventsAfter, MIGRATIONS, migrate } from "../src/store.ts";
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
  assert.equal(b.all<{ c: number }>("SELECT count(*) AS c FROM _migrations")[0].c, MIGRATIONS.length);
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
  const ins = (id: string) => sql.run("INSERT INTO projects (id, name, kind, opened_at) VALUES (?, 'n', 'k', 0)", id);
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

test("migration 2 on a populated v1 database keeps projects, events, triggers and the foreign key", () => {
  const sql = nodeSql(); // foreign_keys = ON, like production
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  sql.script(MIGRATIONS[0]);
  sql.run("INSERT INTO _migrations (version) VALUES (1)");
  sql.run("INSERT INTO projects (id, name, path, kind, opened_at) VALUES ('tvdash', 'TV', '/p/tvdash', 'web', 5)");
  sql.run("INSERT INTO projects (id, name, path, kind, opened_at) VALUES ('lite', 'Lite', '/p/lite', 'cli', 6)");
  const a = appendEvent(sql, { project: "tvdash", kind: "x", payload: { n: 1 } }, 7);
  const b = appendEvent(sql, { kind: "ping" }, 8);
  migrate(sql);
  assert.deepEqual(sql.all<{ version: number }>("SELECT version FROM _migrations ORDER BY version").map((r) => ({ ...r })), [{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }, { version: 6 }, { version: 7 }, { version: 8 }, { version: 9 }, { version: 10 }, { version: 11 }, { version: 12 }]);
  assert.deepEqual(sql.all("SELECT id, name, kind, repo, manifest, opened_at, archived_at FROM projects ORDER BY id").map((r) => ({ ...r })), [
    { id: "lite", name: "Lite", kind: "cli", repo: null, manifest: null, opened_at: 6, archived_at: null },
    { id: "tvdash", name: "TV", kind: "web", repo: null, manifest: null, opened_at: 5, archived_at: null },
  ]);
  assert.deepEqual(
    sql.all<{ name: string }>("SELECT name FROM pragma_table_info('projects') ORDER BY cid").map((c) => c.name),
    ["id", "name", "kind", "repo", "manifest", "opened_at", "archived_at"],
  );
  assert.deepEqual(eventsAfter(sql).map((e) => [e.seq, e.project, e.payload]), [[a.seq, "tvdash", { n: 1 }], [b.seq, null, {}]]);
  // triggers survive, and so does the foreign key (now pointing at the rebuilt table)
  assert.throws(() => sql.run("UPDATE events SET kind = 'x' WHERE seq = ?", a.seq), /append-only/);
  assert.throws(() => sql.run("DELETE FROM events WHERE seq = ?", a.seq), /append-only/);
  assert.throws(() => appendEvent(sql, { project: "nope", kind: "x" }), /FOREIGN KEY/);
  assert.equal(appendEvent(sql, { project: "lite", kind: "x" }).project, "lite");
  assert.throws(() => sql.run("DELETE FROM projects WHERE id = 'tvdash'"), /FOREIGN KEY/);
  assert.throws(() => sql.run("INSERT INTO projects (id, name, kind, opened_at) VALUES ('Bad', 'n', 'k', 0)"), /CHECK/);
  assert.throws(() => sql.run("INSERT INTO projects (id, name, kind, manifest, opened_at) VALUES ('ok', 'n', 'k', 'nope', 0)"), /CHECK/);
  assert.equal(sql.all("SELECT name FROM sqlite_master WHERE name = 'projects_v1'").length, 0);
});

test("migration 3 on a populated v2 database keeps rows, events and triggers and adds archived_at", () => {
  const sql = nodeSql();
  sql.script("CREATE TABLE _migrations (version INTEGER PRIMARY KEY)");
  for (let v = 0; v < 2; v++) {
    sql.script(MIGRATIONS[v]);
    sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
  }
  sql.run("INSERT INTO projects (id, name, kind, repo, manifest, opened_at) VALUES ('tvdash', 'TV', 'web', 'https://x/y', '{\"tree\":[\"a\"],\"files\":{}}', 5)");
  const a = appendEvent(sql, { project: "tvdash", kind: "x", payload: { n: 1 } }, 7);
  migrate(sql);
  assert.deepEqual(sql.all<{ version: number }>("SELECT version FROM _migrations ORDER BY version").map((r) => r.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual({ ...sql.all("SELECT id, name, kind, repo, manifest, opened_at, archived_at FROM projects")[0] }, {
    id: "tvdash", name: "TV", kind: "web", repo: "https://x/y", manifest: '{"tree":["a"],"files":{}}', opened_at: 5, archived_at: null,
  });
  assert.deepEqual(eventsAfter(sql).map((e) => [e.seq, e.project, e.payload]), [[a.seq, "tvdash", { n: 1 }]]);
  assert.throws(() => sql.run("UPDATE events SET kind = 'x' WHERE seq = ?", a.seq), /append-only/);
  assert.throws(() => sql.run("DELETE FROM events WHERE seq = ?", a.seq), /append-only/);
  assert.throws(() => appendEvent(sql, { project: "nope", kind: "x" }), /FOREIGN KEY/);
});
