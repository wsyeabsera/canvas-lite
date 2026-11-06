---
sidebar_position: 6
slug: /api
---

# Project API

A read-only JSON API the watch page uses. It returns what the `list_projects` tool and `read_project` with `include_manifest: true` return
(see [Open a project](open-project.md)); `GET /api/projects/<id>` always includes the manifest. Same-origin only: no CORS headers are sent.

## Auth

Send `Authorization: Bearer <LITE_TOKEN>`, as for `/mcp`. A deployed Worker without a token answers 503.
Every response is `Content-Type: application/json` with `Cache-Control: no-store`.

## Endpoints

`GET /api/projects` returns 200 (archived projects are left out):

```json
{ "projects": [{ "id": "tvdash", "name": "tvdash", "kind": "web", "repo": "https://github.com/yab/tvdash", "opened_at": 1767225600000, "files": 42 }] }
```

`GET /api/projects/<id>` returns 200:

```json
{ "project": { "id": "tvdash", "name": "tvdash", "kind": "web", "repo": null, "opened_at": 1767225600000, "files": 42 },
  "manifest": { "tree": ["README.md", "src/"], "files": { "README.md": "# tvdash" } },
  "events": [{ "seq": 7, "project": "tvdash", "kind": "project.opened", "payload": { "name": "tvdash", "files": 42 } }] }
```

`<id>` matches `^[a-z0-9][a-z0-9-]*$`, at most 40 characters. `HEAD` works like `GET`.

`GET /api/projects/<id>/canvases` returns 200 (removed canvases are left out; see [Canvas and screens](canvas.md)):

```json
{ "canvases": [{ "id": "main", "name": "Main", "screens": 2, "updated_at": 1767225600000, "start_screen": null, "dangling": 0, "unlinked": 1 }] }
```

Beyond the `list_canvases` tool's fields the page list carries what the landing page needs in one call: `start_screen` (null: the first screen), `dangling` (links to screens that do not exist, each target once per screen) and `unlinked` (controls with no `data-to`, `data-back` or `data-inert`, from the same scan as the write-time warning). Both counts are computed server-side from every screen's html. The `list_canvases` tool answer is unchanged.

`GET /api/projects/<id>/canvases/<canvas>` returns 200, with each screen's `html` included (the `read_canvas` tool leaves it out by default) and its `bytes`, the UTF-8 byte length of the html (also reported by the tool whether or not html is included):

```json
{ "canvas": { "id": "main", "name": "Main", "screens": 1, "created_at": 1767225500000, "updated_at": 1767225600000 },
  "screens": [{ "id": "home", "name": "Home", "width": 400, "height": 300, "x": null, "y": null, "updated_at": 1767225600000, "bytes": 9, "html": "<p>hi</p>" }] }
```

The answer also carries `"tour"` (`{steps:[{screen,dwell_ms,note?}], duration_ms, missing}` or null), `"scenarios"` (`[{id, name, description?, steps:[{screen,via?,dwell_ms,caption?}], duration_ms, missing}]`, `[]` when none) and `"presenter"` (the project's session `{active, canvas, screen, transition}` or null); see [Prototype tools](prototype-tools.md).

`<canvas>` follows the same id rule.

`GET /api/projects/<id>/canvases/<canvas>/timeline` returns 200: the canvas's events, oldest first (`canvas.created`, `screen.set`, `screen.removed`, `flow.set`; `screen` and `name` are null except for the two screen kinds):

The answer also carries `floor`: the oldest seq whose canvas state can still be rebuilt (only the newest 20 versions of each screen are kept, see [Database](database.md)); 0 when nothing was pruned. Every event is still listed, including those below the floor.

```json
{ "canvas": "main", "floor": 0, "events": [
  { "seq": 12, "ts": 1767225500000, "kind": "canvas.created", "screen": null, "name": null },
  { "seq": 13, "ts": 1767225600000, "kind": "screen.set", "screen": "home", "name": "Home" },
  { "seq": 14, "ts": 1767225700000, "kind": "flow.set", "screen": null, "name": null } ] }
```

`GET /api/projects/<id>/canvases/<canvas>/at/<seq>` returns 200: the canvas as it was after event `seq` (a non-negative integer; past the end is the latest state; 0 is empty unless history was pruned). A `seq` below the timeline `floor` is clamped up to it: the answer's `seq` is the state actually shown and `floor` is repeated on the answer, so a client can tell it was clamped. Screens are in creation order with their html; `seq` on a screen is the event that wrote that version; `ts` is the time of the canvas event at exactly `seq`, else null; the flow is as of `seq`:

```json
{ "canvas": { "id": "main", "name": "Main" }, "seq": 13, "floor": 0, "ts": 1767225600000,
  "screens": [{ "id": "home", "name": "Home", "width": 400, "height": 300, "x": null, "y": null, "seq": 13, "bytes": 9, "layout": { "x": 0, "y": 0 }, "html": "<p>hi</p>" }],
  "start_screen": null, "transition": "none" }
```

`GET /api/projects/<id>/scenes` returns 200 (removed scenes are left out; see [3D scenes](scenes.md)): the `list_scenes` answer.

```json
{ "scenes": [{ "id": "town", "name": "Small town", "objects": 6, "films": 1, "updated_at": 1767225600000 }] }
```

`GET /api/projects/<id>/scenes/<sid>` returns 200: the `read_scene` answer, with each film's `duration_ms` and `missing` (shot indexes whose focus or look-at object no longer exists):

```json
{ "scene": { "name": "Small town", "objects": [], "lights": [], "sky": { "top": "#2c4a7a", "bottom": "#f0b27a" }, "camera": { "pos": [0, 20, 55], "look": [0, 0, 0], "fov": 50 } },
  "films": [{ "id": "tour", "name": "Town tour", "shots": [], "duration_ms": 0, "missing": [] }],
  "updated_at": 1767225600000 }
```

`<sid>` follows the same id rule. Both routes use the same token gate and 404/400 rules as the canvas routes: an unknown project or scene is 404, an invalid id is 400.

Both need a live (not removed) canvas, else 404. Any other path below `/api/projects/<id>` is 400.

## Errors

Body is `{ "error": "<message>" }`.

| Status | When |
|---|---|
| 400 | invalid id, invalid `<seq>`, or extra path segments |
| 401 | missing or wrong token (`WWW-Authenticate: Bearer`) |
| 404 | unknown project (`unknown project "<id>"`), unknown or removed canvas (`unknown canvas "<id>"`) or unknown `/api/` path |
| 405 | method other than GET or HEAD (`Allow: GET, HEAD`) |
| 503 | server has no token configured |
