---
sidebar_position: 13
slug: /auth
---

# Login and admin

The watch page can be opened two ways. **With the token**, as before: `/#token=<LITE_TOKEN>` once, kept in the browser. **With a password**: set the secret `LITE_PASSWORD` and the page shows a sign-in form instead of the token message. Claude and the CLI keep using the bearer token on `/mcp`, `/events` and `/api`; the password only opens the page. There is one person, the owner: any valid session is also the admin. No accounts, no invites.

```
wrangler secret put LITE_PASSWORD     # the page password
wrangler secret put LITE_TOKEN        # still required: /mcp and a deployed Worker's fail-closed check
```

With `LITE_PASSWORD` unset nothing changes and `/login` answers 404.

## Session

`POST /login` with `{"password": "..."}`. A right password answers 200 and sets one cookie:

`lite_session=<exp>.<hmac>; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000` (plus `Secure` on https)

`hmac` is HMAC-SHA256 keyed with the password over `lite-session:<exp>`, so a session needs no server state: **changing `LITE_PASSWORD` signs everyone out**. A session lasts 30 days. `POST /logout` clears the cookie. Both refuse a cross-site `Origin` with 403 and any method but POST with 405. A body over 1024 bytes or without a string `password` is 400. The password is never logged or echoed.

`GET /api/auth` (no token needed) answers `{password, session}`: whether a login exists, and whether this request holds a valid session. The page uses it to choose between the sign-in form and the token message, and to show **Sign out**.

A valid session cookie is accepted wherever the bearer token is, **except `/mcp`**: on `/api/*`, and on the `/events` WebSocket (the Worker verifies the cookie at the upgrade and tells the Hub in the `X-Lite-Session` header it alone sets, any client-sent value is stripped; the first `hello` then needs no token). A POST to `/api` with a cross-site `Origin` is 403.

## Throttle

Five wrong passwords from one connection (`CF-Connecting-IP`) within 15 minutes pause sign-in for that connection until the window ends: `429 {"error": "Too many tries", "retry_after": <seconds>}` with `Retry-After`; even the right password waits. A wrong one answers `401 {"error": "Wrong password", "tries_left": n}`. A right one forgets earlier failures. The counts live in the Hub table `login_attempts` (`src/login-limit.ts`); old rows are dropped on the next failure.

## Admin

`#/admin` shows what Lite holds: totals (projects, designs, scenes, events) and a table of every live project with its designs, scenes, last activity and, for a project that holds nothing (no design, scene or design system), an **Archive** button behind a confirm dialog. It is the same archive as `remove_project`: nothing is deleted and `open_project` brings the project back. Anything else says `in use`.

| Endpoint | Does |
|---|---|
| `GET /api/admin/overview` | `{totals: {projects, designs, scenes, events}, projects: [{id, name, designs, scenes, has_design_system, last_activity, archivable}]}` |
| `POST /api/admin/projects/<id>/archive` | `{archived: id}`; 409 when the project holds anything, 404 when unknown |

Both need the token or a session. The admin page is the one place the watch page writes, and it writes only this archive.

## Code

`src/session.ts` (cookie sign and verify), `src/login-limit.ts` (throttle), `src/login.ts` (the `/login` and `/logout` handlers), `src/admin.ts` (overview and archive), thin wiring in `src/index.ts` and `src/hub.ts`; the page is `web/login.ts`, `web/login-view.ts`, `web/admin.ts` and `web/admin-view.ts`.
