import { test } from "node:test";
import assert from "node:assert/strict";
import { GAP, layoutScreens, type Placeable } from "../web/layout.ts";

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
