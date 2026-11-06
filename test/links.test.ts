import { test } from "node:test";
import assert from "node:assert/strict";
import { danglingTargets, extractLinks, readLink } from "../web/links.ts";

test("readLink validates the id and defaults transition and back", () => {
  assert.deepEqual(readLink("home", null, null), { to: "home", transition: "none", back: false });
  assert.deepEqual(readLink(" a-1 ", "Slide-Left", ""), { to: "a-1", transition: "slide-left", back: true });
  assert.equal(readLink("x", "spin", "false")?.transition, "none");
  assert.equal(readLink("x", null, "false")?.back, false);
  for (const bad of [null, "", "Home", "a b", "../x", "javascript:alert(1)", "a".repeat(41)]) assert.equal(readLink(bad, null, null), null);
});

test("extractLinks finds links in order with all quote styles", () => {
  const html = `<a data-to="one" data-transition=fade>1</a><div class="x" DATA-TO='two' data-back>2</div><button data-to=three data-back="false">3</button>`;
  assert.deepEqual(extractLinks(html), [
    { to: "one", transition: "fade", back: false },
    { to: "two", transition: "none", back: true },
    { to: "three", transition: "none", back: false },
  ]);
});

test("extractLinks ignores bad targets, plain tags and handles empty html", () => {
  assert.deepEqual(extractLinks(""), []);
  assert.deepEqual(extractLinks(`<a href="#" data-x="1">x</a><a data-to="">y</a><a data-to="Bad Id">z</a><p>data-to="no"</p>`), []);
  assert.equal(extractLinks(`<a data-to="a" data-to="b">`)[0]?.to, "a");
});

test("danglingTargets lists unknown targets once", () => {
  const links = extractLinks(`<a data-to="a"></a><a data-to="gone"></a><a data-to="gone"></a><a data-to="b"></a>`);
  assert.deepEqual(danglingTargets(links, ["a", "b"]), ["gone"]);
  assert.deepEqual(danglingTargets([], ["a"]), []);
});
