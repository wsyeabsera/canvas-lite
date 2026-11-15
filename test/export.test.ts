import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExportArgs, sceneFileText, sceneUrl } from "../cli/export-core.ts";

test("parseExportArgs: project and scene, file defaults to <scene>.json, --out overrides, - is stdout", () => {
  assert.deepEqual(parseExportArgs(["office", "base-body"]), { project: "office", scene: "base-body", out: "base-body.json" });
  assert.equal(parseExportArgs(["office", "base-body", "--out", "x/body.json"]).out, "x/body.json");
  assert.equal(parseExportArgs(["--out", "-", "office", "base-body"]).out, "-");
});

test("parseExportArgs rejects a wrong count, a missing --out value and bad ids with a usage line", () => {
  assert.throws(() => parseExportArgs([]), /usage: lite export/);
  assert.throws(() => parseExportArgs(["a"]), /usage: lite export/);
  assert.throws(() => parseExportArgs(["a", "b", "c"]), /usage: lite export/);
  assert.throws(() => parseExportArgs(["a", "b", "--out"]), /usage: lite export/);
  assert.throws(() => parseExportArgs(["Office", "b"]), /invalid project id "Office"/);
  assert.throws(() => parseExportArgs(["a", "../b"]), /invalid scene id "\.\.\/b"/);
});

test("sceneUrl: local dev by default, ws and paths reduced to the origin, other schemes refused", () => {
  assert.equal(sceneUrl(undefined, "p", "s"), "http://127.0.0.1:8790/api/projects/p/scenes/s");
  assert.equal(sceneUrl("", "p", "s"), "http://127.0.0.1:8790/api/projects/p/scenes/s");
  assert.equal(sceneUrl("wss://lite.example.dev/events", "p", "s"), "https://lite.example.dev/api/projects/p/scenes/s");
  assert.equal(sceneUrl("https://lite.example.dev/mcp", "p", "s"), "https://lite.example.dev/api/projects/p/scenes/s");
  assert.throws(() => sceneUrl("ftp://x", "p", "s"), /unsupported URL scheme/);
});

test("sceneFileText writes only the scene, indented, with a trailing newline", () => {
  const scene = { name: "Body", objects: [{ id: "head", kind: "sphere", size: [0.2] }], lights: [], sky: { top: "#000000", bottom: "#ffffff" }, camera: { pos: [0, 1, 5], look: [0, 0, 0], fov: 50 } };
  const text = sceneFileText({ scene, films: [], page: null, updated_at: 1 });
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(JSON.parse(text), scene);
  assert.throws(() => sceneFileText({ films: [] }), /no scene with objects/);
  assert.throws(() => sceneFileText(null), /no scene with objects/);
  assert.throws(() => sceneFileText({ scene: { name: "x" } }), /no scene with objects/);
});
