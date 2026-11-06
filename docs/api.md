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
{ "canvases": [{ "id": "main", "name": "Main", "screens": 2, "updated_at": 1767225600000 }] }
```

`GET /api/projects/<id>/canvases/<canvas>` returns 200, with each screen's `html` included (the `read_canvas` tool leaves it out by default) and its `bytes`, the UTF-8 byte length of the html (also reported by the tool whether or not html is included):

```json
{ "canvas": { "id": "main", "name": "Main", "screens": 1, "created_at": 1767225500000, "updated_at": 1767225600000 },
  "screens": [{ "id": "home", "name": "Home", "width": 400, "height": 300, "x": null, "y": null, "updated_at": 1767225600000, "bytes": 9, "html": "<p>hi</p>" }] }
```

The answer also carries `"tour"` (`{steps:[{screen,dwell_ms,note?}], duration_ms, missing}` or null) and `"presenter"` (the project's session `{active, canvas, screen, transition}` or null); see [Prototype tools](prototype-tools.md).

`<canvas>` follows the same id rule. Any other path below `/api/projects/<id>` is 400.

## Errors

Body is `{ "error": "<message>" }`.

| Status | When |
|---|---|
| 400 | invalid id, or extra path segments |
| 401 | missing or wrong token (`WWW-Authenticate: Bearer`) |
| 404 | unknown project (`unknown project "<id>"`), unknown or removed canvas (`unknown canvas "<id>"`) or unknown `/api/` path |
| 405 | method other than GET or HEAD (`Allow: GET, HEAD`) |
| 503 | server has no token configured |
