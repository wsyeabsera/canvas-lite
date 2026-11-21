import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScreens } from "../src/flow.ts";

test("every validate_flow issue kind carries a concrete fix", () => {
  const issues = [
    ...validateScreens([], null),
    ...validateScreens(
      [
        { id: "a", html: `<a data-to="ghost">x</a><a data-to="b" data-transition="spin">y</a><button>Nowhere</button>` },
        { id: "b", html: `<p>dead end</p>` },
        { id: "c", html: `<a data-back>b</a>` },
      ],
      null,
    ),
  ];
  const kinds = new Set(issues.map((i) => i.kind));
  for (const k of ["no_screens", "no_start_screen", "dangling_link", "bad_transition", "unlinked_control", "unreachable", "dead_end"]) assert.ok(kinds.has(k), `fixture must raise ${k}`);
  for (const i of issues) assert.ok(i.fix.length > 10, `${i.kind} has no fix`);
});
