import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLogin, clearFailures, MAX_FAILS, recordFailure, WINDOW_S } from "../src/login-limit.ts";
import { handleLogin, handleLogout, sameOrigin, type Throttle } from "../src/login.ts";
import { verifySession, cookieValue } from "../src/session.ts";
import { migrate } from "../src/store.ts";
import { nodeSql } from "./node-sql.ts";

const sql = nodeSql();
migrate(sql);
const T0 = 1_000_000;

test("five wrong tries lock a key until the window ends; a right password forgets them; keys are independent", () => {
  assert.deepEqual(checkLogin(sql, "a", T0), { locked: false, tries_left: MAX_FAILS });
  for (let i = 1; i < MAX_FAILS; i++) assert.deepEqual(recordFailure(sql, "a", T0 + i), { locked: false, tries_left: MAX_FAILS - i });
  assert.deepEqual(recordFailure(sql, "a", T0 + 10), { locked: true, retry_after: WINDOW_S });
  assert.deepEqual(checkLogin(sql, "a", T0 + 10_000), { locked: true, retry_after: WINDOW_S - 9 });
  assert.deepEqual(checkLogin(sql, "b", T0 + 10_000), { locked: false, tries_left: MAX_FAILS });
  assert.deepEqual(checkLogin(sql, "a", T0 + WINDOW_S * 1000 + 1), { locked: false, tries_left: MAX_FAILS }, "the pause ends with the window");
  clearFailures(sql, "a");
  assert.deepEqual(checkLogin(sql, "a", T0 + 10_000), { locked: false, tries_left: MAX_FAILS });
});

test("old rows are dropped when the next failure is recorded", () => {
  recordFailure(sql, "old", 1);
  recordFailure(sql, "new", WINDOW_S * 1000 + 5);
  assert.equal(sql.all("SELECT 1 FROM login_attempts WHERE key = 'old'").length, 0);
});

const throttle = (): Throttle => {
  const s = nodeSql();
  migrate(s);
  return { loginCheck: async (k) => checkLogin(s, k), loginFailed: async (k) => recordFailure(s, k), loginOk: async (k) => clearFailures(s, k) };
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://lite.example/login", { method: "POST", headers: { "CF-Connecting-IP": "1.2.3.4", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("right password: 200 and a session cookie that verifies; wrong password counts down then pauses", async () => {
  const t = throttle();
  const ok = await handleLogin(post({ password: "pw" }), "pw", t);
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("Set-Cookie")!;
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure$/);
  assert.equal(await verifySession("pw", cookieValue(cookie)), true);
  const bad = await handleLogin(post({ password: "nope" }), "pw", t);
  assert.deepEqual([bad.status, (await bad.json()) as unknown], [401, { error: "Wrong password", tries_left: 4 }]);
  assert.equal(bad.headers.get("Set-Cookie"), null);
  let last!: Response;
  for (let i = 0; i < 4; i++) last = await handleLogin(post({ password: "nope" }), "pw", t);
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("Retry-After")) > 0);
  const stillLocked = await handleLogin(post({ password: "pw" }), "pw", t);
  assert.equal(stillLocked.status, 429, "even the right password waits out the pause");
});

test("login refuses cross-site, bad bodies, other methods and a missing password setting", async () => {
  const t = throttle();
  assert.equal((await handleLogin(post({ password: "pw" }, { Origin: "https://evil.example" }), "pw", t)).status, 403);
  assert.equal((await handleLogin(post({ password: "pw" }, { Origin: "https://lite.example" }), "pw", t)).status, 200);
  assert.equal((await handleLogin(post("not json"), "pw", t)).status, 400);
  assert.equal((await handleLogin(post({ password: 5 }), "pw", t)).status, 400);
  assert.equal((await handleLogin(post("x".repeat(2000)), "pw", t)).status, 400);
  assert.equal((await handleLogin(new Request("https://lite.example/login"), "pw", t)).status, 405);
  assert.equal((await handleLogin(post({ password: "pw" }), undefined, t)).status, 404);
  assert.equal(sameOrigin(null, new URL("https://a/")), true);
  assert.equal(sameOrigin("https://a", new URL("https://a/x")), true);
  assert.equal(sameOrigin("https://b", new URL("https://a/x")), false);
});

test("logout clears the cookie, POST only, same origin only", () => {
  const out = handleLogout(new Request("https://lite.example/logout", { method: "POST" }));
  assert.equal(out.status, 200);
  assert.match(out.headers.get("Set-Cookie")!, /^lite_session=; .*Max-Age=0/);
  assert.equal(handleLogout(new Request("https://lite.example/logout")).status, 405);
  assert.equal(handleLogout(new Request("https://lite.example/logout", { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);
});
