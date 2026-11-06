import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenFromHash } from "../web/token.ts";

test("the token comes from the URL fragment only", () => {
  assert.equal(tokenFromHash("#token=abc123"), "abc123");
  assert.equal(tokenFromHash("#a=1&token=abc%2B1"), "abc+1");
  for (const none of ["", "#", "#tokens=abc", "#token=", "?token=abc", "#xtoken=abc"]) assert.equal(tokenFromHash(none), undefined, none);
});
