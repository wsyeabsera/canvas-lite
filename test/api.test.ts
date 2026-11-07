import { test } from "node:test";
import assert from "node:assert/strict";
import { gateApi, hubErrorResponse, isApiPath, json, routeApi } from "../src/api.ts";

const status = (r: ReturnType<typeof routeApi>) => (r.kind === "error" ? r.status : r.kind);

test("list and read routes", () => {
  assert.deepEqual(routeApi("GET", "/api/projects"), { kind: "list" });
  assert.deepEqual(routeApi("HEAD", "/api/projects"), { kind: "list" });
  assert.deepEqual(routeApi("GET", "/api/projects/tvdash"), { kind: "read", id: "tvdash" });
  assert.deepEqual(routeApi("HEAD", "/api/projects/a-1"), { kind: "read", id: "a-1" });
  assert.deepEqual(routeApi("GET", `/api/projects/${"a".repeat(40)}`), { kind: "read", id: "a".repeat(40) });
});

test("invalid ids are 400", () => {
  for (const p of ["/api/projects/../x", "/api/projects/A", `/api/projects/${"a".repeat(41)}`, "/api/projects/a/b", "/api/projects/", "/api/projects/-a", "/api/projects/%2e%2e", "/api/projects/a/", "/api/projects/a/b/c"])
    assert.equal(status(routeApi("GET", p)), 400, p);
});

test("unknown api paths are 404", () => {
  for (const p of ["/api/", "/api/nope", "/api/projects2"]) assert.equal(status(routeApi("GET", p)), 404, p);
  assert.equal(status(routeApi("POST", "/api/nope")), 404);
});

test("other methods are 405 with Allow", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const p of ["/api/projects", "/api/projects/tvdash"]) {
      const r = routeApi(m, p);
      assert.equal(status(r), 405, `${m} ${p}`);
      assert.equal(r.kind === "error" && r.headers?.Allow, "GET, HEAD");
    }
  }
});

test("isApiPath", () => {
  assert.equal(isApiPath("/api/projects"), true);
  assert.equal(isApiPath("/api"), false);
  assert.equal(isApiPath("/mcp"), false);
});

test("auth gate: fail closed first, then bearer", () => {
  const remote = new URL("https://lite.example.com/api/projects");
  const local = new URL("http://localhost:8787/api/projects");
  assert.equal(gateApi("Bearer x", undefined, remote), 503);
  assert.equal(gateApi(null, undefined, remote), 503);
  assert.equal(gateApi(null, undefined, local), "ok");
  assert.equal(gateApi(null, "s3", remote), 401);
  assert.equal(gateApi("Bearer nope", "s3", remote), 401);
  assert.equal(gateApi("Basic s3", "s3", remote), 401);
  assert.equal(gateApi("Bearer s3", "s3", remote), "ok");
});

test("json sets type, no-store, no CORS", async () => {
  const r = json(405, { error: "x" }, { Allow: "GET, HEAD" });
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Content-Type"), "application/json");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.equal(r.headers.get("Allow"), "GET, HEAD");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
  assert.deepEqual(await r.json(), { error: "x" });
});

test("hub errors: unknown project is 404 with the MCP text, others 500", async () => {
  const nf = hubErrorResponse(new Error('unknown project "zzz"'));
  assert.equal(nf.status, 404);
  assert.deepEqual(await nf.json(), { error: 'unknown project "zzz"' });
  assert.equal(hubErrorResponse(new Error("boom")).status, 500);
});

test("scene routes parse; bad ids and shapes are 400, other methods 405, unknown scene is a 404 hub error", () => {
  assert.deepEqual(routeApi("GET", "/api/projects/p/scenes"), { kind: "scenes", id: "p" });
  assert.deepEqual(routeApi("HEAD", "/api/projects/p/scenes"), { kind: "scenes", id: "p" });
  assert.deepEqual(routeApi("GET", "/api/projects/p/scenes/s"), { kind: "scene", id: "p", scene: "s" });
  assert.deepEqual(routeApi("GET", `/api/projects/p/scenes/${"s".repeat(40)}`), { kind: "scene", id: "p", scene: "s".repeat(40) });
  for (const p of ["/api/projects/p/scenes/", "/api/projects/p/scenes/Bad", "/api/projects/p/scenes/-x", `/api/projects/p/scenes/${"s".repeat(41)}`, "/api/projects/p/scenes/%2e%2e", "/api/projects/P/scenes", "/api/projects/p/scenes/a/films"])
    assert.equal(status(routeApi("GET", p)), 400, p);
  for (const m of ["POST", "PUT", "DELETE"]) {
    const r = routeApi(m, "/api/projects/p/scenes/s");
    assert.equal(status(r), 405, m);
    assert.equal(r.kind === "error" && r.headers?.Allow, "GET, HEAD");
  }
});

test("hubErrorResponse: unknown scene is 404", async () => {
  assert.equal(hubErrorResponse(new Error('unknown scene "x"')).status, 404);
  assert.equal(hubErrorResponse(new Error("boom")).status, 500);
});
