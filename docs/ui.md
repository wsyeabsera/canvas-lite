---
sidebar_position: 7
slug: /ui
---

# The watch page

`/` on the Worker is a read-only page. It never sends anything except the websocket `hello` and `GET` requests.

## Views

| Route | Shows |
|---|---|
| `#/` | **Activity**: every event, newest at the bottom, live. The sidebar's first item. |
| `#/project/<id>` | One project: kind, repo link, a line from its README, the file list Claude told Lite about, and its events. |
| `#/project/<id>/canvas/<cid>` | A canvas: the whole window is a pannable, zoomable surface with every screen at its real size, live. See [Canvas and screens](canvas.md) for the keys. |
| `#/project/<id>/canvas/<cid>/screen/<sid>` | The same surface, fitted to one screen. |

The project page also has a **Canvases** card. The **Projects** sidebar lists every project Lite has been told about (from `project.opened` events), each with its event count; the open project's canvases appear indented under it.

The page targets desktop browsers; narrow screens are not a goal yet.

## Opening it with the token

The deployed Worker needs its token. Open the page once with the token in the fragment:

```
https://<worker>/#token=<your token>
```

The page keeps it in this browser's local storage and removes it from the address bar. The fragment is never sent to the server, and the token is never put in a query string. Without a valid token the page shows a **locked** card instead of the app.

## Theme

The pill in the top bar (on a canvas: in the top-right island) cycles **auto** (follows the system), **light** and **dark**; the choice is remembered in local storage. Panels are frosted glass (`backdrop-filter`) over soft colour; browsers without it get more opaque panels.

## Backdrop (spike)

On the Activity and project pages, browsers with WebGPU draw a slow, calm mesh gradient behind the glass (the [`shaders`](https://github.com/shader-effects-inc/shaders) package, MIT, no account, telemetry off). It follows the theme, pauses while the tab is hidden, draws one still frame under `prefers-reduced-motion`, and is never started on a canvas, which keeps its plain dotted surface. Without WebGPU, or if it fails to start, the page keeps its CSS gradient and the shader code is never downloaded.

## How it is built

- `public/index.html` holds the markup and all styling, with fixed element ids the script renders into.
- `web/state.ts` is the pure state (events, projects, routes); `web/theme.ts` the theme logic. Both are unit tested.
- `web/page.ts` draws the state and reuses `cli/watch-core.ts` (the same reconnecting client `lite watch` uses) and `cli/format.ts`.
- `npm run build:web` bundles it to `public/page.js` with esbuild (code splitting: lazily imported code goes to `public/chunk-*.js` next to it, gitignored); `npm run deploy` does that and builds these docs first.
- `web/backdrop.ts` is the pure backdrop logic (WebGPU check, when to run, theme colours), unit tested; `web/backdrop-view.ts` mounts the shader and is loaded with `import()` only when WebGPU exists.
- `web/canvas.ts`, `web/layout.ts` and `web/viewport.ts` are the pure canvas logic, `web/canvas-view.ts` draws the canvas surface; `public/_headers` sets the Content-Security-Policy (see [Canvas and screens](canvas.md)).
- `web/replay.ts` is the pure replay logic (event index, stepping, playback timing, ticks, labels, keys), unit tested (`test/replay.test.ts`); `web/replay-view.ts` draws the replay layer and bar (see [Canvas and screens](canvas.md)).
- Project details come from `GET /api/projects/<id>` (see [the API](api.md)).
