import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_FILES, siteDecision } from "../src/site-gate.ts";

const read = (p: string) => String(readFileSync(`${import.meta.dirname}/../${p}`));

test("password set, no session: only the sign-in page and its script are served, the rest redirects", () => {
  for (const p of PUBLIC_FILES) assert.equal(siteDecision("GET", p, true, false), "serve", p);
  for (const p of ["/", "/index.html", "/page.js", "/chunk-ABC.js", "/docs/", "/docs/auth", "/docs/assets/js/main.js", "/favicon.ico", "/login.html", "/login/", "/login-page.js.map"])
    assert.equal(siteDecision("GET", p, true, false), "redirect-login", p);
  assert.equal(siteDecision("HEAD", "/", true, false), "redirect-login");
});

test("password set with a session, or no password at all: everything is served as before", () => {
  for (const p of ["/", "/page.js", "/docs/", "/login"]) {
    assert.equal(siteDecision("GET", p, true, true), "serve", p);
    assert.equal(siteDecision("GET", p, false, false), "serve", p);
  }
});

test("only GET and HEAD reach the files", () => {
  for (const m of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) assert.equal(siteDecision(m, "/", true, true), "not-found", m);
});

test("the Worker must run before the static files, or the gate never sees a request", () => {
  const cfg = read("wrangler.jsonc");
  assert.match(cfg, /"run_worker_first": true/);
  assert.match(cfg, /"binding": "ASSETS"/);
});

test("the sign-in page loads exactly one script, its own, and posts nothing by itself", () => {
  const html = read("public/login.html");
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]), ['<script type="module" src="/login-page.js">']);
  assert.match(html, /<form id="login"/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /<form[^>]*\saction=/);
  assert.match(read("public/_headers"), /\/login\n  Content-Security-Policy: default-src 'none'; script-src 'self'/);
});
