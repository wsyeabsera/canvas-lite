import { test } from "node:test";
import assert from "node:assert/strict";
import { createCanvas, linkStats, listCanvases, listCanvasesForPage, setFlow, setScreen, type ScreenInput } from "../src/canvases.ts";
import { openProject } from "../src/projects.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const fresh = () => {
  const sql = nodeSql();
  migrate(sql);
  openProject(sql, { name: "tvdash", manifest: { tree: [], files: {} } }, 1);
  return sql;
};
const scr = (o: Partial<ScreenInput>): ScreenInput => ({ canvas: "main", name: "Home", width: 400, height: 300, html: "<p>hi</p>", ...o });

test("linkStats counts dangling targets once per screen and unlinked controls", () => {
  const s = linkStats([
    { id: "a", html: '<button data-to="b">Go</button><a data-to="gone">x</a><a data-to="gone">y</a><button>Dead</button>' },
    { id: "b", html: '<button data-inert>ok</button><button data-back>Back</button><a data-to="a">a</a>' },
  ]);
  assert.deepEqual(s, { dangling: 1, unlinked: 1 });
  assert.deepEqual(linkStats([]), { dangling: 0, unlinked: 0 });
});

test("listCanvasesForPage adds start_screen and link counts; list_canvases is unchanged", () => {
  const sql = fresh();
  createCanvas(sql, "tvdash", { name: "Main" }, 10);
  createCanvas(sql, "tvdash", { name: "Empty" }, 11);
  setScreen(sql, "tvdash", scr({ id: "home", html: '<button data-to="next">Go</button><button>Dead</button>' }), 50);
  setScreen(sql, "tvdash", scr({ id: "next", name: "Next", html: '<a data-to="nowhere">x</a>' }), 51);
  setFlow(sql, "tvdash", "main", { start_screen: "next" }, 52);
  const list = listCanvasesForPage(sql, "tvdash").canvases;
  assert.deepEqual(list.map((c) => ({ id: c.id, start: c.start_screen, d: c.dangling, u: c.unlinked, n: c.screens })), [
    { id: "main", start: "next", d: 1, u: 1, n: 2 },
    { id: "empty", start: null, d: 0, u: 0, n: 0 },
  ]);
  assert.deepEqual(Object.keys(listCanvases(sql, "tvdash").canvases[0]).sort(), ["id", "name", "screens", "updated_at"]);
  assert.throws(() => listCanvasesForPage(sql, "nope"), { message: 'unknown project "nope"' });
});
