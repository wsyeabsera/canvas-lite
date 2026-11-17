import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, columnsFor, layoutScreens, type Placeable } from "../web/layout.ts";

const s = (id: string, width: number, height: number, x: number | null = null, y: number | null = null): Placeable => ({ id, width, height, x, y });

test("auto layout: rows of three from 0,0, GAP apart, rows as tall as the tallest", () => {
  const boxes = layoutScreens([s("a", 100, 50), s("b", 200, 300), s("c", 10, 10), s("d", 40, 40), s("e", 50, 50)]);
  assert.deepEqual(boxes.map((b) => [b.id, b.x, b.y]), [
    ["a", 0, 0],
    ["b", 100 + GAP, 0],
    ["c", 100 + GAP + 200 + GAP, 0],
    ["d", 0, 300 + GAP],
    ["e", 40 + GAP, 300 + GAP],
  ]);
  assert.deepEqual([boxes[1]!.w, boxes[1]!.h], [200, 300]);
  assert.equal(GAP, 160);
});

test("placed screens keep x and y; auto ones still fill rows from 0,0", () => {
  const boxes = layoutScreens([s("p", 100, 100, 5000, -200), s("a", 100, 100), s("half", 100, 100, 10, null), s("b", 100, 100)]);
  assert.deepEqual(boxes.map((b) => [b.id, b.x, b.y]), [
    ["p", 5000, -200],
    ["a", 0, 0],
    ["half", 100 + GAP, 0], // x without y is auto
    ["b", 2 * (100 + GAP), 0],
  ]);
  assert.deepEqual(layoutScreens([]), []);
});

test("a large canvas gets more columns so it is not a tower; small ones keep three", () => {
  assert.deepEqual([1, 9, 10, 25, 50].map(columnsFor), [3, 3, 4, 7, 9]);
  const many = Array.from({ length: 25 }, (_, i) => s(`s${i}`, 100, 100));
  const boxes = layoutScreens(many);
  assert.equal(boxes.filter((b) => b.y === 0).length, 7);
  assert.equal(Math.max(...boxes.map((b) => b.y)) / (100 + GAP), 3);
});

import { minimap, stepZoom, viewFromMap } from "../web/viewport.ts";
test("zoom steps land on round stops from any scale", () => {
  assert.equal(stepZoom(0.0816, 1), 0.1);
  assert.equal(stepZoom(0.1, 1), 0.125);
  assert.equal(stepZoom(0.137, -1), 0.125);
  assert.equal(stepZoom(2, 1), 2);
  assert.equal(stepZoom(0.05, -1), 0.05);
  assert.equal(stepZoom(1, -1), 0.75);
});

test("minimap keeps the visible box inside and a click on it centres the view there", () => {
  const boxes = [{ id: "a", x: 0, y: 0, w: 1000, h: 500 }, { id: "b", x: 2000, y: 0, w: 1000, h: 500 }];
  const surface = { w: 800, h: 600 };
  const v = { k: 0.5, x: 0, y: 0 }; // sees world 0..1600 x 0..1200
  const m = minimap(boxes, v, surface, { w: 180, h: 112 })!;
  assert.equal(m.rects.length, 2);
  assert.ok(m.view.x >= 0 && m.view.y >= 0 && m.view.x + m.view.w <= 180.001 && m.view.y + m.view.h <= 112.001);
  const next = viewFromMap(m, m.rects[1]!.x + m.rects[1]!.w / 2, m.rects[1]!.y + m.rects[1]!.h / 2, v, surface);
  assert.equal(next.k, 0.5);
  assert.ok(Math.abs((surface.w / 2 - next.x) / 0.5 - 2500) < 1); // the centre of b
  assert.equal(minimap([], v, surface, { w: 180, h: 112 }), null);
});
