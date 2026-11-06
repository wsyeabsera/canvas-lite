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

| `#/project/<id>/canvas/<cid>/play[/<sid>]` | **Play** (present mode) over the canvas: one screen at a time, fitted to the window. Starts at `<sid>`, else the canvas start screen (first screen when unset). Linkable; the address follows the screen on show without adding history entries. See below. |

The project page also has a **Canvases** card. The **Projects** sidebar lists every project Lite has been told about (from `project.opened` events), each with its event count; the open project's canvases appear indented under it.

The page targets desktop browsers; narrow screens are not a goal yet.

## Play

A blue **Play** pill in the canvas's top-right island (key `P`) opens present mode on the canvas start screen, or on the focused screen when pressed on a screen route. The screen is fitted and centred on a near-black stage, aspect kept (`fitRect`, 56 px padding, never above 200%); under it the canvas stays exactly as it was. A slim glass bar floats top centre: Back (Left arrow), Restart (`R`), progress dots with the screen name and `n / total`, a Mouse / Remote toggle (`M`) and Exit (`Esc`). The bar fades after 2 s without input and returns on mouse move or a key; it stays while the pointer is over it.

- **Links.** Elements with `data-to` or `data-back` are hotspots. Hover shows a blue ring over the element's own box and a chip `<target> · <transition> · Enter`; holding `Shift` outlines every link with a dashed line. A link to a screen that does not exist shows `No screen "<id>"` and a toast when clicked, and does nothing. `data-back` at the start of the history does nothing.
- **Transitions.** `none`, `fade`, `slide-left`, `slide-right`, `push`, 220 ms; the link's `data-transition` wins over the canvas default; both screens are mounted while one plays and the entering screen is loaded first, so nothing flashes blank. Back plays the reverse. `prefers-reduced-motion` turns every transition into `none`.
- **Remote mode.** Arrow keys move a focus ring (white inner, blue outer) to the nearest link in that direction, `Enter` follows it, `Backspace` and `Esc` go back (and leave Play at the start of the history, like a TV). The mouse keeps working. In Mouse mode: Left arrow / `Backspace` back, `Esc` exit, `Enter` follows the hovered link.
- **Stage.** The stage is the start screen's size, other screens are drawn at their own size top-left. A purely visual frame is chosen by that size (16:9 and 1280+ px wide: TV bezel; 600 px wide or less and tall: phone; else none); `F` cycles none, TV, phone.
- **History.** The back stack lives in the browser tab only. Reloading starts again at the start screen (or the `/play/<sid>` screen). A live edit reloads the screen on show in place; removed screens leave the history.

Screens in Play are `<iframe sandbox="allow-same-origin" srcdoc>`, **never `allow-scripts`**, so they still run no code; the page reads `[data-to]` from `frame.contentDocument` and lays the hotspots over the frame from the elements' boxes. The canvas keeps its empty sandbox. The CSP is unchanged.

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
- `web/play.ts` is the pure Play logic (back stack, next screen, transition resolution and planning, spatial focus, stage fit, dots, key intents, the sandbox string), unit tested in `test/play.test.ts`; `web/play-view.ts` draws it and exposes `goto(screenId, transition?)` for remote control.
- Project details come from `GET /api/projects/<id>` (see [the API](api.md)).
