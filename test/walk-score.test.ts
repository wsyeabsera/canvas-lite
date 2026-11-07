import { test } from "node:test";
import assert from "node:assert/strict";
import { deadScreens, distances, reachedGoal, scoreWalk, seen } from "../src/walk-score.ts";

test("seen: visible text only, link labels in document order, ids never shown", () => {
  const s = seen(`<html><head><title>Secret title</title><style>.a{color:red}</style></head><body><script>var x=1</script><!-- hidden -->
    <h1>Your cart</h1><div data-to='pay-step' data-transition='fade'><b>Pay</b> now <div>nested</div></div><a data-back>Back</a><p>Total &amp; tax</p><div data-to='pay-step'><b>Pay</b> now <div>nested</div></div></body></html>`);
  assert.equal(s.text, "Your cart Pay now nested Back Total & tax Pay now nested");
  assert.deepEqual(s.choices, [{ label: "Pay now nested", to: "pay-step" }, { label: "Back", to: null }], "the duplicate link is one choice");
  assert.ok(!JSON.stringify(s).includes("Secret title") && !s.text.includes("hidden") && !s.text.includes("var x"));
});

test("seen: inert controls and void elements are not choices; empty labels fall back to aria-label, then a marker", () => {
  const s = seen(`<div data-to='a' data-inert>Nope</div><img data-to='b'><div data-to='c' aria-label='Open menu'></div><div data-to='d'></div><div data-back></div>`);
  assert.deepEqual(s.choices.map((c) => c.label), ["Open menu", "(unlabelled)", "Back"]);
});

const screens = [
  { id: "cart", html: "<div data-to='pay'>Continue</div><div data-to='help'>Help</div>" },
  { id: "pay", html: "<div data-to='done'>Confirm</div>" },
  { id: "done", html: "Order confirmed" },
  { id: "help", html: "<div data-to='faq'>FAQ</div>" },
  { id: "faq", html: "Questions" },
  { id: "island", html: "<div data-to='done'>Away</div>" },
];

test("distances: moves to the nearest screen whose text shows the target; unreachable screens are absent", () => {
  const d = distances(screens, "ORDER CONFIRMED");
  assert.deepEqual([...d].sort(), [["cart", 2], ["done", 0], ["island", 1], ["pay", 1]]);
  assert.equal(d.has("faq"), false);
  assert.equal(distances(screens, "  ").size, 0);
  assert.equal(reachedGoal(screens[2].html, "order confirmed"), true);
  assert.equal(reachedGoal(screens[0].html, "order confirmed"), false);
});

test("scoreWalk: steps against the shortest path, wrong turns, dead ends and whether the goal was reached", () => {
  const d = distances(screens, "order confirmed");
  const dead = new Set(deadScreens(screens));
  assert.deepEqual(deadScreens(screens).sort(), ["done", "faq", "island"].filter((id) => id !== "island"), "done and faq have no links");
  assert.deepEqual(scoreWalk(["cart", "pay", "done"], d, dead, true), { steps: 2, shortest: 2, wrong_turns: 0, dead_ends: 0, reached: true });
  const lost = scoreWalk(["cart", "help", "faq", "help", "faq"], d, dead, false);
  assert.deepEqual([lost.steps, lost.shortest, lost.wrong_turns, lost.dead_ends, lost.reached], [4, 2, 1, 1, false], "only the move that left the way to the goal is wrong; faq has no way on");
  assert.equal(scoreWalk(["faq"], d, dead, false).shortest, null, "no path to the goal from here");
  assert.equal(scoreWalk(["done"], d, dead, true).dead_ends, 0, "the goal screen is never a dead end");
});
