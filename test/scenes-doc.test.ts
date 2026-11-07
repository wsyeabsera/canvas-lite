import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkScene } from "../src/scene.ts";
import { checkFilms } from "../src/shots.ts";

const doc = String(readFileSync(`${import.meta.dirname}/../docs/scenes.md`));

function block(tag: string): unknown {
  const m = new RegExp("```json " + tag + "\\n([\\s\\S]*?)\\n```").exec(doc);
  assert.ok(m, "docs/scenes.md has a ```json " + tag + " block");
  return JSON.parse(m[1]);
}

test("the scenes doc example scene is valid input", () => {
  const scene = checkScene(block("scene"));
  assert.equal(scene.name, "Small town");
});

test("the scenes doc example films are valid input for that scene", () => {
  const scene = checkScene(block("scene"));
  const films = checkFilms(block("films"), scene);
  assert.equal(films.length, 1);
  assert.equal(films[0].shots.length, 3);
});
