import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage, pageCoverage, SECTION_HTML_MAX, unsafeHtml } from "../src/page-model.ts";
import { checkScene } from "../src/scene.ts";
import { checkFilms } from "../src/shots.ts";
import { createScene, readScene, setFilms, setPage, setScene } from "../src/scene-store.ts";
import { openProject } from "../src/projects.ts";
import { eventsAfter, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const sceneIn = {
  name: "Town",
  objects: [{ id: "house", kind: "box", pos: [0, 1, 0], size: [2, 2, 2] }],
  lights: [{ id: "sun", kind: "sun", color: "#ffffff", intensity: 1, pos: [10, 20, 10] }],
  sky: { top: "#2c4a7a", bottom: "#f0b27a" },
  camera: { pos: [0, 5, 20], look: "house", fov: 50 },
};
const scene = checkScene(sceneIn);
const shot = (id: string) => ({ id, name: id, from: { pos: [0, 5, 20], look: "house" }, to: { pos: [5, 5, 15], look: "house" }, duration_ms: 4000 });
const filmsIn = [{ id: "tour", name: "Tour", shots: [shot("a"), shot("b"), shot("c")] }];
const films = checkFilms(filmsIn, scene);
const sec = (over: Record<string, unknown> = {}) => ({ id: "intro", html: "<h1>Hi</h1>", shot: "a", ...over });

test("a valid page is normalised, pairs and options kept", () => {
  const p = checkPage({ sections: [sec({ title: "Intro", align: "left", height_vh: 150, gap_vh: 20 }), sec({ id: "two", shot: ["b", "c"] })] }, scene, films);
  assert.deepEqual(p.sections[0], { id: "intro", html: "<h1>Hi</h1>", shot: "a", title: "Intro", align: "left", height_vh: 150, gap_vh: 20 });
  assert.deepEqual(p.sections[1].shot, ["b", "c"]);
});

test("a missing shot id is named with its section", () => {
  assert.throws(() => checkPage({ sections: [sec({ shot: "zz" })] }, scene, films), /section "intro".*unknown shot "zz"/);
  assert.throws(() => checkPage({ sections: [sec({ shot: ["a", "zz"] })] }, scene, films), /unknown shot "zz"/);
  assert.throws(() => checkPage({ sections: [sec({ shot: ["a"] })] }, scene, films), /shot must be/);
});

test("hostile html is rejected naming the section and the construct", () => {
  const bad: [string, RegExp][] = [
    ["<p>x</p><script>alert(1)</script>", /<script>/],
    ["<SCRIPT src=x></SCRIPT>", /<script>/],
    ['<img src=x onerror="alert(1)">', /onerror attribute/],
    ["<img/src=x/onload=alert(1)>", /onload attribute/],
    ["<div\nonclick = 'x'>hi</div>", /onclick attribute/],
    ['<a href="javascript:alert(1)">x</a>', /javascript: url/],
    ['<a href="  JaVa\tScRiPt:alert(1)">x</a>', /javascript: url/],
    ['<a href="javascript&colon;alert(1)">x</a>', /javascript: url/],
    ['<iframe src="https://x"></iframe>', /<iframe>/],
    ["<object data=x></object>", /<object>/],
    ["<embed src=x>", /<embed>/],
    ['<form action="/x"><input></form>', /<form>/],
  ];
  for (const [html, re] of bad)
    assert.throws(() => checkPage({ sections: [sec({ id: "hero", html })] }, scene, films), (e: Error) => /section "hero"/.test(e.message) && re.test(e.message), html);
  assert.equal(unsafeHtml("<p>Use onclick= and javascript: in prose</p><a href='https://x.y'>ok</a>"), null);
});

test("limits: sections, html bytes, title, ids, ranges", () => {
  const many = (n: number) => ({ sections: Array.from({ length: n }, (_, i) => sec({ id: `s${i}` })) });
  assert.equal(checkPage(many(12), scene, films).sections.length, 12);
  assert.throws(() => checkPage(many(13), scene, films), /1 to 12 sections/);
  assert.throws(() => checkPage({ sections: [] }, scene, films), /1 to 12 sections/);
  assert.throws(() => checkPage({ sections: [sec({ html: "x".repeat(SECTION_HTML_MAX + 1) })] }, scene, films), /20000/);
  assert.equal(checkPage({ sections: [sec({ html: "é".repeat(SECTION_HTML_MAX / 2) })] }, scene, films).sections.length, 1);
  assert.throws(() => checkPage({ sections: [sec({ html: "é".repeat(SECTION_HTML_MAX / 2 + 1) })] }, scene, films), /bytes, limit 20000/);
  const big = { sections: Array.from({ length: 6 }, (_, i) => sec({ id: `s${i}`, html: "x".repeat(18_000) })) };
  assert.throws(() => checkPage(big, scene, films), /100000/);
  assert.throws(() => checkPage({ sections: [sec({ title: "t".repeat(81) })] }, scene, films), /title/);
  assert.throws(() => checkPage({ sections: [sec({ id: "Bad id" })] }, scene, films), /id/);
  assert.throws(() => checkPage({ sections: [sec(), sec()] }, scene, films), /duplicate id "intro"/);
  assert.throws(() => checkPage({ sections: [sec({ height_vh: 49 })] }, scene, films), /height_vh/);
  assert.throws(() => checkPage({ sections: [sec({ height_vh: 301 })] }, scene, films), /height_vh/);
  assert.throws(() => checkPage({ sections: [sec({ gap_vh: 101 })] }, scene, films), /gap_vh/);
  assert.throws(() => checkPage({ sections: [sec({ align: "top" })] }, scene, films), /align/);
  assert.throws(() => checkPage("x", scene, films), /must be \{sections/);
});

test("pageCoverage lists shots no section uses", () => {
  const p = checkPage({ sections: [sec({ shot: "a" })] }, scene, films);
  assert.deepEqual(pageCoverage(p, films), [{ film: "tour", shot: "b" }, { film: "tour", shot: "c" }]);
  const q = checkPage({ sections: [sec({ shot: ["a", "c"] }), sec({ id: "b2", shot: "b" })] }, scene, films);
  assert.deepEqual(pageCoverage(q, films), []);
});

test("setPage stores the page, emits a body-free event, clears, and revive resets it", () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  createScene(sql, "tvdash", { name: "Town" }, 2);
  setScene(sql, "tvdash", "town", sceneIn, 3);
  assert.equal(readScene(sql, "tvdash", "town").page, null);
  assert.throws(() => setPage(sql, "tvdash", "town", { sections: [sec()] }, 4), /unknown shot "a"/);
  setFilms(sql, "tvdash", "town", filmsIn, 5);
  const { result, event } = setPage(sql, "tvdash", "town", { sections: [sec(), sec({ id: "two", shot: ["b", "c"] })] }, 6);
  assert.deepEqual(result, { scene: "town", sections: 2 });
  assert.deepEqual([event.kind, event.payload], ["page.set", { scene: "town", sections: 2 }]);
  const r = readScene(sql, "tvdash", "town");
  assert.equal(r.page?.sections.length, 2);
  assert.equal(r.updated_at, 6);
  assert.equal(JSON.stringify(eventsAfter(sql)).includes("<h1>"), false);
  assert.equal(setPage(sql, "tvdash", "town", null, 7).result.sections, 0);
  assert.equal(readScene(sql, "tvdash", "town").page, null);
  setPage(sql, "tvdash", "town", { sections: [sec()] }, 8);
  assert.equal(setPage(sql, "tvdash", "town", {}, 9).result.sections, 0);
  assert.throws(() => setPage(sql, "tvdash", "nope", null), /unknown scene/);
});
