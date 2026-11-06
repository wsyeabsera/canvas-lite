import { test } from "node:test";
import assert from "node:assert/strict";
import { listProjects, MANIFEST_LIMIT, OPEN_PROJECT_TEXT, openProject, readProject, type OpenInput } from "../src/projects.ts";
import { eventsAfter, migrate, type Sql } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const fresh = () => {
  const sql = nodeSql();
  migrate(sql);
  return sql;
};
const manifest = { tree: ["hub/", "hub/src/", "package.json"], files: { "package.json": '{ "name": "tvdash" }' } };
const input = (o: Partial<OpenInput> = {}): OpenInput => ({ name: "tvdash", manifest, ...o });

test("open_project returns the summary and the event seq, defaults id and kind", () => {
  const sql = fresh();
  const r = openProject(sql, input({ repo: "https://github.com/yab/tvdash" }), 1000);
  assert.deepEqual(r.project, { id: "tvdash", name: "tvdash", kind: "project", repo: "https://github.com/yab/tvdash", opened_at: 1000, files: 3 });
  assert.equal(r.seq, 1);
  const [e] = eventsAfter(sql);
  assert.equal(e.kind, "project.opened");
  assert.equal(e.project, "tvdash");
  assert.deepEqual(e.payload, {
    name: "tvdash", kind: "project", repo: "https://github.com/yab/tvdash", files: 3, bytes: JSON.stringify(manifest).length,
  });
  assert.equal(openProject(sql, input({ name: "My Cool App!" })).project.id, "my-cool-app");
});

test("bad ids are refused with the spec message and store nothing", () => {
  const sql = fresh();
  for (const bad of ["Bad_Id", "", "..", "../x", "A", "-x", "a b", "x".repeat(41), "a/b"]) {
    assert.throws(
      () => openProject(sql, input({ id: bad })),
      { message: `invalid project id "${bad}": use lowercase letters, digits and -, at most 40` },
      bad,
    );
  }
  assert.equal(listProjects(sql).projects.length, 0);
  assert.equal(eventsAfter(sql).length, 0);
});

test("name, kind, repo and manifest shape are validated", () => {
  const sql = fresh();
  assert.throws(() => openProject(sql, input({ name: "" })), /invalid name/);
  assert.throws(() => openProject(sql, input({ name: "  " })), /invalid name/);
  assert.throws(() => openProject(sql, input({ name: "n".repeat(101), id: "ok" })), /invalid name/);
  assert.equal(openProject(sql, input({ name: "n".repeat(100), id: "ok" })).project.name.length, 100);
  assert.throws(() => openProject(sql, input({ kind: "" })), /invalid kind/);
  assert.throws(() => openProject(sql, input({ kind: "k".repeat(41) })), /invalid kind/);
  assert.throws(() => openProject(sql, input({ kind: 5 as any })), /invalid kind/);
  assert.throws(() => openProject(sql, input({ repo: 5 as any })), /invalid repo/);
  assert.throws(() => openProject(sql, input({ name: "!!!" })), /invalid project id ""/);
  for (const m of [undefined, null, { tree: "x", files: {} }, { tree: [1], files: {} }, { tree: [], files: [] }, { tree: [], files: { a: 1 } }]) {
    assert.throws(() => openProject(sql, input({ manifest: m as any })), /invalid manifest/);
  }
  assert.equal(eventsAfter(sql).length, 1);
});

test("manifest size limit uses the exact message", () => {
  const sql = fresh();
  const big = { tree: [], files: { "a.txt": "x".repeat(65536) } };
  const bytes = JSON.stringify(big).length;
  assert.throws(() => openProject(sql, input({ manifest: big })), { message: `manifest too large: ${bytes} bytes, limit 65536` });
  const overhead = JSON.stringify({ tree: [], files: { "a.txt": "" } }).length;
  const exact = { tree: [], files: { "a.txt": "x".repeat(65536 - overhead) } };
  assert.equal(openProject(sql, input({ manifest: exact })).project.files, 0);
  const multi = { tree: [], files: { "a.txt": "é".repeat(33000) } }; // under 65536 chars, over in bytes
  assert.throws(() => openProject(sql, input({ manifest: multi })), /manifest too large: \d+ bytes, limit 65536/);
  assert.equal(listProjects(sql).projects.length, 1);
  assert.equal(eventsAfter(sql).length, 1);
});

test("same id twice: one row replaced, two events", () => {
  const sql = fresh();
  openProject(sql, input({ repo: "https://x/y" }), 1);
  const r = openProject(sql, input({ id: "tvdash", name: "tvdash 2", kind: "web", manifest: { tree: ["a"], files: {} } }), 2);
  assert.equal(r.seq, 2);
  const { projects } = listProjects(sql);
  assert.deepEqual(projects, [{ id: "tvdash", name: "tvdash 2", kind: "web", repo: null, opened_at: 2, files: 1 }]);
  assert.deepEqual(eventsAfter(sql).map((e) => e.kind), ["project.opened", "project.opened"]);
  assert.deepEqual(readProject(sql, "tvdash").manifest, { tree: ["a"], files: {} });
});

test("the event is written in the same transaction as the project", () => {
  const sql = fresh();
  const failing: Sql = {
    ...sql,
    run: (q, ...p) => sql.run(q, ...p),
    all: (q, ...p) => {
      if (q.startsWith("INSERT INTO events")) throw new Error("disk full");
      return sql.all(q, ...p);
    },
  };
  assert.throws(() => openProject(failing, input()), /disk full/);
  assert.equal(listProjects(sql).projects.length, 0);
  assert.equal(eventsAfter(sql).length, 0);
  // and an existing project is not half-updated either
  openProject(sql, input({ kind: "web" }), 5);
  assert.throws(() => openProject(failing, input({ kind: "cli" }), 6), /disk full/);
  assert.deepEqual(listProjects(sql).projects.map((p) => [p.kind, p.opened_at]), [["web", 5]]);
});

test("list_projects is newest opened first and carries no manifest", () => {
  const sql = fresh();
  openProject(sql, input({ name: "a" }), 10);
  openProject(sql, input({ name: "b" }), 30);
  openProject(sql, input({ name: "c" }), 20);
  const { projects } = listProjects(sql);
  assert.deepEqual(projects.map((p) => p.id), ["b", "c", "a"]);
  assert.ok(projects.every((p) => !("manifest" in p)));
  openProject(sql, input({ name: "a" }), 40); // reopening moves it to the top
  assert.deepEqual(listProjects(sql).projects.map((p) => p.id), ["a", "b", "c"]);
});

test("read_project returns summary, manifest and its latest events; unknown id errors", () => {
  const sql = fresh();
  openProject(sql, input({ name: "other" }), 1);
  for (let i = 0; i < 25; i++) openProject(sql, input(), 100 + i);
  const r = readProject(sql, "tvdash");
  assert.deepEqual(r.manifest, manifest);
  assert.equal(r.project.files, 3);
  assert.equal(r.events.length, 20);
  assert.ok(r.events.every((e) => e.project === "tvdash"));
  assert.ok(r.events[0].seq < r.events[19].seq);
  assert.equal(r.events[19].ts, 124);
  assert.throws(() => readProject(sql, "nope"), { message: 'unknown project "nope"' });
});

test("open_project guidance interpolates the limit and covers the manifest recipe", () => {
  const { description, tree, files, manifest: m } = OPEN_PROJECT_TEXT;
  for (const t of [description, tree, files, m]) assert.ok(t.includes(String(MANIFEST_LIMIT)), t);
  assert.ok(description.includes(`manifest too large: <bytes> bytes, limit ${MANIFEST_LIMIT}`));
  assert.match(description, /repo-relative/);
  assert.match(description, /TREE ENTRIES/);
  assert.match(description, /1500/);
  assert.match(description, /line boundary/);
  assert.match(description, /collapse/i);
});
