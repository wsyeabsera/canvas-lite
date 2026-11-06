import { test } from "node:test";
import assert from "node:assert/strict";
import { hubErrorResponse, routeApi } from "../src/api.ts";

const status = (r: ReturnType<typeof routeApi>) => (r.kind === "error" ? r.status : r.kind);

test("canvas routes", () => {
  assert.deepEqual(routeApi("GET", "/api/projects/tvdash/canvases"), { kind: "canvases", id: "tvdash" });
  assert.deepEqual(routeApi("HEAD", "/api/projects/tvdash/canvases"), { kind: "canvases", id: "tvdash" });
  assert.deepEqual(routeApi("GET", "/api/projects/tvdash/canvases/main-1"), { kind: "canvas", id: "tvdash", canvas: "main-1" });
  assert.deepEqual(routeApi("GET", `/api/projects/a/canvases/${"c".repeat(40)}`), { kind: "canvas", id: "a", canvas: "c".repeat(40) });
});

test("canvas routes: bad ids and paths are 400, other methods 405", () => {
  for (const p of [
    "/api/projects/A/canvases", "/api/projects/a/canvases/", "/api/projects/a/canvases/Bad", "/api/projects/a/canvases/-x",
    `/api/projects/a/canvases/${"c".repeat(41)}`, "/api/projects/a/canvases/%2e%2e", "/api/projects/a/canvases/b/screens", "/api/projects/a/screens",
  ])
    assert.equal(status(routeApi("GET", p)), 400, p);
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const p of ["/api/projects/a/canvases", "/api/projects/a/canvases/main"]) {
      const r = routeApi(m, p);
      assert.equal(status(r), 405, `${m} ${p}`);
      assert.equal(r.kind === "error" && r.headers?.Allow, "GET, HEAD");
    }
  }
});

test("hub errors: unknown canvas is 404 too", async () => {
  const r = hubErrorResponse(new Error('unknown canvas "zzz"'));
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'unknown canvas "zzz"' });
});
