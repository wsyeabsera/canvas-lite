---
sidebar_position: 8
slug: /canvas
---

# Canvas and screens (store, tools, API and watch page built)

A project holds **canvases**; a canvas holds **screens**. Claude writes screens with MCP tools; the watch page shows them live, read-only. Like projects, Lite is *told* the design: Claude sends the HTML of each screen.

## Model

| | Fields |
|---|---|
| canvas | `id` (slug, same rule as project ids), `project`, `name` (1 to 100 chars), `created_at`, `updated_at`, `archived_at` |
| screen | `id` (slug), `canvas`, `name` (1 to 100), `width`, `height` (integers, 100 to 8000, CSS px), `html` (text), `x`, `y` (optional integers; no value = auto layout), `updated_at` |

A canvas id is unique within its project, a screen id within its canvas. Limits: html at most 200,000 bytes per screen, 50 screens per canvas, 20 canvases per project. Over a limit: `screen too large: <n> bytes, limit 200000`, `too many screens: limit 50`, `too many canvases: limit 20`.

## Tools

All tools take `project` (an existing, not archived project id; otherwise `unknown project "<id>"`).

| Tool | Input | Answer |
|---|---|---|
| `create_canvas` | `name`, `id?` | `{canvas}`. Idempotent by id; on an archived id it un-archives and writes the event again. |
| `list_canvases` | | `{canvases:[{id,name,screens,updated_at}]}`, archived hidden |
| `read_canvas` | `canvas`, `include_html?` (default false) | `{canvas, screens:[{id,name,width,height,x,y,updated_at,html?}]}` |
| `set_screen` | `canvas`, `name`, `width`, `height`, `html`, `id?`, `x?`, `y?` | `{screen, created}`. Upsert; `id` defaults to the slug of `name`. |
| `remove_screen` | `canvas`, `id` | `{screen}`; idempotent no-op if already gone |
| `remove_canvas` | `canvas` | archives it, keeps the log; idempotent |

Unknown canvas: `unknown canvas "<id>"`; unknown screen on read: `unknown screen "<id>"`. Tool descriptions tell Claude: one self-contained HTML document per screen, inline CSS, no scripts; images may be `https` URLs or `data:` URIs and nothing else is loaded; size the root to `width` x `height`.

## Events

Appended in the same transaction as the change, with `project` set; the payload never carries html (events stay small, and the page fetches the screen when it hears of it).

| kind | payload |
|---|---|
| `canvas.created` | `{canvas, name}` |
| `screen.set` | `{canvas, id, name, width, height, bytes, created}` |
| `screen.removed` | `{canvas, id, name}` |
| `canvas.removed` | `{canvas, name}` |

## Showing a screen safely

Screen html is untrusted input, written by a model that may have read hostile text. The page shows it only in `<iframe sandbox="" srcdoc="...">` (empty sandbox: no scripts, no forms, no same-origin access). The frame also has `referrerpolicy="no-referrer"` and `loading="lazy"`, and `srcdoc` is set as a DOM property, never parsed into the page. Thumbnails are `pointer-events: none`. The policy is set by `public/_headers` (for `/` and `/index.html`):

```
default-src 'none'; script-src 'self'; connect-src 'self' wss:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: https:; frame-src 'self'; base-uri 'none'; form-action 'none'
```

plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. The page's own script is same-origin only (no inline scripts); `connect-src` allows its fetches and websocket (`'self'`, plus `wss:` for browsers that do not match a ws URL to `'self'`). A srcdoc frame inherits this policy, so a screen cannot run code (also blocked by the empty sandbox), fetch data or load anything but inline styles, images, `data:` fonts and, as a deliberate allowance, Inter from Google Fonts (`fonts.googleapis.com` styles, `fonts.gstatic.com` fonts), which screens could therefore also use. A unit test (`test/canvas.test.ts`) parses `_headers` and asserts the shape. The owner chose to allow `https:` images (2026-11-06). Known trade-off: an image URL can carry data out in its query string, so a screen written by a model that read hostile text could leak what that model knows. Revisit if Lite ever holds anything sensitive.

## As built

Code: `src/canvases.ts` (pure functions over `Sql`, limits as exported constants, tool texts), migration 4 in `src/store.ts`, Hub methods in `src/hub.ts` that broadcast every returned event, tools in `src/mcp.ts`, routes in `src/api.ts`. Details the spec left open:

- `unknown screen "<id>"` is never raised: no tool reads a single screen, and `remove_screen` of a missing screen is the idempotent no-op.
- Archived (removed) canvases are `unknown canvas` for `read_canvas`, `set_screen` and `remove_screen`; `remove_canvas` on one is a no-op, on an id that never existed it is `unknown canvas`. Their rows and screens stay in the database.
- The 20 canvas limit counts live canvases only; un-archiving through `create_canvas` is checked against it too. Creating an existing live canvas never errors, even at the limit, and never renames it.
- `set_screen` replaces the whole screen: an omitted `x` or `y` means no value (auto layout). A replace keeps the screen's place in the order (rowid order) and touches the canvas `updated_at`.
- `x`, `y` are integers within +-1,000,000. Validation errors: `invalid name: use 1 to 100 characters`, `invalid canvas id "<id>": use lowercase letters, digits and -, at most 40` (and `screen id`), `invalid width: use an integer from 100 to 8000` (and `height`), `invalid html: expected text`, `invalid x: use an integer`.
- Answers: `create_canvas` `{canvas:{id,name,screens,created_at,updated_at}}`; `read_canvas` `{canvas, screens}`; `set_screen` `{screen:{id,name,width,height,x,y,updated_at}, created}`; `remove_screen` `{screen:{canvas,id,name?}}` (`name` only when something was removed); `remove_canvas` `{canvas:{..., archived_at}}`.
- The HTTP API answers 404 for `unknown project "<id>"` and `unknown canvas "<id>"`, 400 for bad ids or other path shapes, 405 for non-GET/HEAD.

## API for the page

`GET /api/projects/<id>/canvases` and `GET /api/projects/<id>/canvases/<canvas>` (screens including html), behind the same token gate as the other API routes.

## In the watch page

Routes `#/project/<id>/canvas/<cid>` (screens as a grid of 16:9 thumbnails, each with name and `W × H`, the most recently updated one with an accent ring) and `#/project/<id>/canvas/<cid>/screen/<sid>` (one screen large, "k of n", previous/next, arrow keys, "All screens" link). The project page has a Canvases card (name, screen count, updated; empty: "No canvases yet. Ask Claude to create one."), and the open project's canvases appear indented under it in the sidebar. An empty canvas says it is waiting for `set_screen`. After a `screen.set` event the screen shows a shimmering "Claude is writing <name>..." placeholder until the refetched html arrives (no animation under `prefers-reduced-motion`).

Live: a `canvas.created`, `screen.set`, `screen.removed` or `canvas.removed` event of the open project refetches the list, and the canvas too when it is the open one (debounced 150 ms, stale answers ignored). Logic lives in `web/canvas.ts` (ordering, prev/next, "updated X ago", scale math, iframe spec), tested in `test/canvas.test.ts`. The Activity stream shows these events as `set <name> in <canvas>`, `removed <name> from <canvas>`, `created canvas <name>`, `removed canvas <name>`.
