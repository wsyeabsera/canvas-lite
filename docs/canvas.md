---
sidebar_position: 8
slug: /canvas
---

# Canvas and screens (spec, not built yet)

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

Screen html is untrusted input, written by a model that may have read hostile text. The page shows it only in `<iframe sandbox="" srcdoc="...">` (empty sandbox: no scripts, no forms, no same-origin access). The page's Content-Security-Policy, inherited by the srcdoc frame, allows `style-src 'unsafe-inline'`, `img-src data: https:` and `font-src data:` and nothing else, so a screen cannot run code, fetch data or load anything but images. The owner chose to allow `https:` images (2026-11-06). Known trade-off: an image URL can carry data out in its query string, so a screen written by a model that read hostile text could leak what that model knows. Revisit if Lite ever holds anything sensitive.

## API for the page

`GET /api/projects/<id>/canvases` and `GET /api/projects/<id>/canvases/<canvas>` (screens including html), behind the same token gate as the other API routes.
