import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHello, replay } from "../src/events.ts";
import { safeEqual, tokenOk } from "../src/auth.ts";
import { appendEvent, migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

test("parseHello accepts only the hello message", () => {
  assert.deepEqual(parseHello('{"hello":{"token":"t","after":5}}'), { token: "t", after: 5 });
  assert.deepEqual(parseHello('{"hello":{"after":0}}'), { after: 0 });
  for (const bad of [undefined, 3, "", "nope", "{}", '{"hello":1}', '{"hello":{"after":-1}}', '{"hello":{"after":1.5}}', '{"hello":{"after":"1"}}', '{"hello":{"token":7,"after":0}}', '{"ping":true}', "x".repeat(3000)])
    assert.equal(parseHello(bad), null, String(bad).slice(0, 30));
});

test("replay is gapless and ordered across pages", () => {
  const sql = nodeSql();
  migrate(sql);
  for (let i = 1; i <= 25; i++) appendEvent(sql, { kind: "ping", payload: { i } });
  assert.deepEqual([...replay(sql, 0, 10)].map((e) => e.seq), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual([...replay(sql, 20, 10)].map((e) => e.seq), [21, 22, 23, 24, 25]);
  assert.deepEqual([...replay(sql, 25, 10)], []);
  assert.equal([...replay(sql, 0, 5)].length, 25, "an exact multiple of the page size ends cleanly");
});

test("token comparison", () => {
  assert.ok(safeEqual("abc", "abc"));
  for (const [a, b] of [["abc", "abd"], ["abc", "ab"], ["", "a"]]) assert.ok(!safeEqual(a, b));
  assert.ok(tokenOk(undefined, undefined), "no token configured: open (local dev)");
  assert.ok(tokenOk("s", "s"));
  assert.ok(!tokenOk(undefined, "s"));
  assert.ok(!tokenOk("x", "s"));
});
