import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieValue, sessionCookie, sessionOk, signSession, verifySession } from "../src/session.ts";

const NOW = 1_800_000_000_000;
const exp = Math.floor(NOW / 1000) + 100;

test("a signed session verifies until it expires and only with the same secret", async () => {
  const v = await signSession("pw", exp);
  assert.match(v, /^\d+\.[0-9a-f]{64}$/);
  assert.equal(await verifySession("pw", v, NOW), true);
  assert.equal(await verifySession("other", v, NOW), false, "a changed password signs everyone out");
  assert.equal(await verifySession("pw", v, NOW + 101_000), false, "expired");
  assert.equal(await verifySession("pw", v.replace(/^\d+/, String(exp + 999)), NOW), false, "the expiry cannot be edited");
});

test("no secret, no cookie or a malformed value is never a session", async () => {
  const v = await signSession("pw", exp);
  assert.equal(await verifySession(undefined, v, NOW), false);
  assert.equal(await verifySession("pw", undefined, NOW), false);
  for (const bad of ["", "x", "1.2", `${exp}.${"g".repeat(64)}`, `${exp}.${"a".repeat(63)}`]) assert.equal(await verifySession("pw", bad, NOW), false, bad);
});

test("cookie parsing and the Set-Cookie attributes", async () => {
  assert.equal(cookieValue("a=1; lite_session=abc; b=2"), "abc");
  assert.equal(cookieValue("a=1"), undefined);
  assert.equal(cookieValue(null), undefined);
  assert.equal(cookieValue("xlite_session=no; lite_session=yes"), "yes");
  assert.equal(sessionCookie("v", 60, true), "lite_session=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure");
  assert.equal(sessionCookie("", 0, false), "lite_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  const req = new Request("https://x/", { headers: { Cookie: `lite_session=${await signSession("pw", Math.floor(Date.now() / 1000) + 50)}` } });
  assert.equal(await sessionOk(req, "pw"), true);
  assert.equal(await sessionOk(new Request("https://x/"), "pw"), false);
});
