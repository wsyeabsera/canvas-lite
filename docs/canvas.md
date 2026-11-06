---
sidebar_position: 8
slug: /canvas
---

# Canvas and screens (store, tools and API built; page not yet)

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

Unknown canvas: `unknown canvas "<id>"`; unknown screen on read: `unknown screen "<id>"`. Tool descriptions tell Claude: one self-contained HTML document per screen, inline CSS, no scripts, images may be https URLs or data: URIs and nothing else is loaded, size the root to `width` x `height`.

## Events

Appended in the same transaction as the change, with `project` set; the payload never carries html (events stay small, and the page fetches the screen when it hears of it).

| kind | payload |
|---|---|
| `canvas.created` | `{canvas, name}` |
| `screen.set` | `{canvas, id, name, width, height, bytes, created}` |
| `screen.removed` | `{canvas, id, name}` |
| `canvas.removed` | `{canvas, name}` |

## Showing a screen safely

Screen html is untrusted input, written by a model that may have read hostile text. The page shows it only in `<iframe sandbox="" srcdoc="...">` (empty sandbox: no scripts, no forms, no same-origin access). The page's Content-Security-Policy, inherited by the srcdoc frame, allows `style-src 'unsafe-inline'; img-src data: https:; font-src data:` and nothing else, so a screen cannot run code, load fonts or stylesheets from elsewhere, or fetch. Owner decision: `https:` images are allowed (the tool text tells Claude so).

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
