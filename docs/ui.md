---
sidebar_position: 7
slug: /ui
---

# The watch page

`/` on the Worker is a read-only page. It never sends anything except the websocket `hello` and `GET` requests.

## Views

| Route | Shows |
|---|---|
| `#/` | **Landing**: the designer's gallery of designs (canvases), see below. |
| `#/activity` | **Activity**: every event, newest at the bottom, live. Reached from the small **Activity** link at the bottom of the landing page. Any unreadable hash also lands here. |
| `#/project/<id>` | One project (no longer linked from the UI; old links still open it): kind, repo link, a line from its README, the file list Claude told Lite about, and its events. |
| `#/project/<id>/canvas/<cid>` | A canvas: the whole window is a pannable, zoomable surface with every screen at its real size, live. See [Canvas and screens](canvas.md) for the keys. |
| `#/project/<id>/canvas/<cid>/screen/<sid>` | The same surface, fitted to one screen. |

| `#/project/<id>/canvas/<cid>/walk` | **Walkthrough** over the canvas. The route is parsed here; the handler belongs to the play layer. Until that lands the page redirects it to Play. |
| `#/project/<id>/canvas/<cid>/play[/<sid>]` | **Play** (present mode) over the canvas: one screen at a time, fitted to the window. Starts at `<sid>`, else the canvas start screen (first screen when unset). Linkable; the address follows the screen on show without adding history entries. See below. |
| `#/project/<id>/canvas/<cid>/walk` | **Walkthrough**, a mode of Play: the same fitted stage with a step rail on the right (see [Walkthrough](#walkthrough)). |
| `#/project/<id>/canvas/<cid>/watch[/<scenarioId>]` | **Watch**, the scenario video player: without an id the picker, with an id the player (see [Watch](#watch)). |

The project page also has a **Canvases** card, but nothing in the UI links to it any more: the page shows designs only. There is no sidebar on any view. The activity and project pages are full-width under the top bar (a **Designs** back arrow to `#/`, the wordmark, status, the docs link and the theme pill); the canvas's top-left pill shows the design name with a back arrow to `#/`.

The page targets desktop browsers; narrow screens are not a goal yet.

## Landing

`#/` is a gallery, not a console: no files, events or raw activity on it. A top row has the **Lite** wordmark, a rounded glass search box ("Search designs": every word must appear in the design or its project name; `Esc` clears), a **project dropdown** and the theme pill with the docs link. The dropdown (a glass pill with a native select) lists **All projects** (default) and each project that has designs as `name (count)`; it narrows the gallery and the chip counts (not the Continue strip or the banner), is remembered in local storage (`lite.project`, ignored when that project is gone) and is hidden when there is only one project.

- **Claude is presenting.** While a `presenter.*` session is active in any project (folded from the events the page already receives, across projects) a glass banner shows a green dot, `<canvas name>, step n of m` and a blue **Watch live** button that opens Play on that canvas.
- **Continue.** One wide card for the last design you opened: a 213 x 118 live thumbnail of its start screen, the name, `12 screens · you stopped at <screen> · 5 min ago`, a blue **Play** (resumes at that screen) and an outlined **Walkthrough**. Opening a canvas, screen or Play route remembers `{project, canvas, screen, ts}` in local storage (`lite.last`); Play remembers each screen it moves to. Hidden when nothing was opened yet or the canvas is gone.
- **Designs.** Quiet chips **All N**, **Playable N**, **Needs links N**, then one flat 4-column gallery of glass cards sorted by last update, newest first (no project headings). A card has a 150 px thumbnail (the canvas start screen, else its first screen), the name, a small muted project label (only while All projects is selected), `N screens · updated 1 h ago` and a badge: green **Playable** when the canvas has screens, no dangling link and no unlinked control, amber **N missing links** (dangling links plus unlinked controls, the counts of `validate_flow` and the write-time warning), grey **No screens** for an empty canvas (counted only under All). Hover or keyboard focus dims the thumbnail and shows **Play** (`#/project/<id>/canvas/<cid>/play`) and **Walkthrough** (the `/walk` route); a click anywhere else on the card opens the canvas.
- **Thumbnails** are the screen in `<iframe sandbox="" srcdoc>` (the same empty sandbox as the canvas: no scripts, no same-origin), `pointer-events: none`, scaled with a CSS transform to fit (`thumbFit`). They are fetched lazily when a card scrolls into view (`GET /api/projects/<id>/canvases/<cid>`) and cached per canvas version (`updated_at`); the link counts come in the one list per project.
- **Empty.** With no design at all (shown once the first websocket backfill had time to arrive): "Nothing yet. Ask Claude to design something."
- Canvas and project events refresh the list after a short debounce; relative times tick in place so thumbnails never reload. Desktop only.

## Play

A blue **Play** pill in the canvas's top-right island (key `P`) opens present mode on the canvas start screen, or on the focused screen when pressed on a screen route. The screen is fitted and centred on a near-black stage, aspect kept (`fitRect`, 56 px padding, never above 200%); under it the canvas stays exactly as it was. A slim glass bar floats top centre: Back (Left arrow), Restart (`R`), progress dots with the screen name and `n / total`, a Mouse / Remote toggle (`M`) and Exit (`Esc`). The bar fades after 2 s without input and returns on mouse move or a key; it stays while the pointer is over it.

- **Links.** Elements with `data-to` or `data-back` are hotspots. Hover shows a blue ring over the element's own box and a chip `<target> · <transition> · Enter`; holding `Shift` outlines every link with a dashed line, and also every unlinked control (a button, link or input with no `data-to`, `data-back` or `data-inert`) with an orange dashed outline and a `No link` chip; those are never clickable. A link to a screen that does not exist shows `No screen "<id>"` and a toast when clicked, and does nothing. `data-back` at the start of the history does nothing.
- **Transitions.** `none`, `fade`, `slide-left`, `slide-right`, `push`, 220 ms; the link's `data-transition` wins over the canvas default; both screens are mounted while one plays and the entering screen is loaded first, so nothing flashes blank. Back plays the reverse. `prefers-reduced-motion` turns every transition into `none`.
- **Remote mode.** Arrow keys move a focus ring (white inner, blue outer) to the nearest link in that direction, `Enter` follows it, `Backspace` and `Esc` go back (and leave Play at the start of the history, like a TV). The mouse keeps working. In Mouse mode: Left arrow / `Backspace` back, `Esc` exit, `Enter` follows the hovered link.
- **Stage.** The stage is the start screen's size, other screens are drawn at their own size top-left. A purely visual frame is chosen by that size (16:9 and 1280+ px wide: TV bezel; 600 px wide or less and tall: phone; else none); `F` cycles none, TV, phone.
- **Claude presenting.** While Claude presents (see [Prototype tools](prototype-tools.md)), Play opens on its canvas by itself and jumps with each live `goto`; a glass pill (green dot, "Claude is presenting", screen name and step, dots, **Take over**) replaces the bar. Taking over (the button, or a link, Back or Restart by the viewer) stops following and brings the bar back with a **Follow** button. When the canvas has a tour the bar has a **Tour** button that plays it by itself (pause and resume on the same button, the step note as a caption under the stage).
- **History.** The back stack lives in the browser tab only. Reloading starts again at the start screen (or the `/play/<sid>` screen). A live edit reloads the screen on show in place; removed screens leave the history.

Screens in Play are `<iframe sandbox="allow-same-origin" srcdoc>`, **never `allow-scripts`**, so they still run no code; the page reads `[data-to]` from `frame.contentDocument` and lays the hotspots over the frame from the elements' boxes. The canvas keeps its empty sandbox. The CSP is unchanged.

## Walkthrough

The canvas's Play pill is a split control, **Play | Walkthrough** (Play stays blue and primary; Walkthrough is the neutral segment beside it). Key `W` on a canvas opens the same thing. The route is `#/project/<id>/canvas/<cid>/walk` (`{view: "walk", id, canvas}` in `web/state.ts`, `hrefWalk`).

It is Play with a guided layout: the screen on the left in the usual fitted stage and device frame, a 344 px glass **step rail** on the right, and a glass pill at the top left (`Walkthrough  <canvas name>  [Exit Esc]`). The rail has a header (`5 steps · about 13 s` from the tour's total duration; `N screens` without a tour), the numbered steps (the current one highlighted blue with a filled number circle), an **Auto-advance** switch, and **Previous** and **Next** buttons.

- **Steps.** The canvas tour when it has one (`set_tour`: screen, `dwell_ms`, `note`; steps for missing screens are dropped). Without a tour: the screens in walk order from the effective start, following the first outgoing `data-to` of each screen (`data-back` links skipped) until a repeat or a dead end; titled by screen name, no notes, 2500 ms each.
- **Spotlight and callout.** Each step shows its screen with the canvas default transition. The first link of the screen (top, then left) gets a blue ring and the rest of the screen is dimmed (`rgba(5,6,10,.55)`). A step with a note also gets a glass callout with a blue 1 px border (`Step n · <screen name>` in blue, the note, a muted hint) below the link, or above it when there is no room. Without a note there is no callout; the spotlight stays. A screen with no links has neither. Both wait for the transition to finish.
- **Moving.** `Right`/`Left`, Next/Previous or a click on a step. `Space` toggles Auto-advance (each step's `dwell_ms`; it stops after the last step and starts again from the top if switched on there). `Esc` or Exit goes back to where the walkthrough was opened. Moving by hand restarts the auto-advance clock from the new step.
- **Links inside the screen** still work: a link to a screen that is a step moves the rail to that step; any other screen is shown and the rail stays (no spotlight, since that screen is not the step).
- **Claude presenting.** The pill and Follow behave as in Play. A Follow jump to a screen that is a step moves the rail to it; Auto-advance is left as the viewer set it. The Tour button is not shown in a walkthrough.
- Reduced motion: no transitions and no fades.

## Watch

Claude can store **scenarios** on a canvas (`scenarios` in `GET /api/projects/<id>/canvases/<cid>`: `{id, name, description?, steps:[{screen, via?, dwell_ms, caption?}], duration_ms, missing:[step indexes]}`; the event `scenarios.set` refetches the open canvas). The watch page plays one like a video. Open it with the neutral **Watch** segment of the canvas island (**Play | Walkthrough | Watch**; Play stays the blue primary one), key `V`, or the **Watch** button that appears on a landing card's hover once its canvas detail (fetched for the thumbnail) shows scenarios. With no scenarios the button is disabled with the title "No scenarios yet: ask Claude to add some". Route: `#/project/<id>/canvas/<cid>/watch[/<scenarioId>]` (`{view: "watch", id, canvas, scenario}`, `hrefWatch`).

- **Picker** (`/watch`): a near-black glass page. A small caps line `<canvas name> · N scenarios · about 1 min 40 s`, the title "Pick a scenario to watch", a 2-column grid of glass cards (a 300 x 169 poster of the first screen in a sandboxed frame, a `m:ss` duration chip, a round play badge, the title, the description, `N steps`) and a blue **Play all, one after another**. `Esc` (or the Canvas button) returns to the canvas.
- **Player** (`/watch/<id>`): the played screen in the same fitted stage and device frame as Play (`sandbox="allow-same-origin"`, never `allow-scripts`; the frames take no pointer). Step 0 is the first screen. For each later step a white arrow cursor (28 x 34, drawn over the stage) glides about 600 ms (ease in and out; reduced motion jumps) to the centre of the first element of the previous step's screen whose `data-to` is this step's screen (going back to a screen an earlier step showed: a `data-back` element when no `data-to` matches; `via` is a case-insensitive text hint to choose among several), a ripple ring plays for 250 ms, then the screen changes with the canvas default transition. No such element: the screen just changes. `dwell_ms` is how long it stays once it appears. Steps listed in `missing` or naming a screen the canvas lacks are skipped.
- **Chrome.** Top left a glass chip `<scenario>  Scenario i of n`; top right **Scenarios** (picker) and **Exit Esc**; the caption as a dark glass subtitle at the bottom centre of the stage (when it exists and Captions is on; remembered in local storage as `lite.watch.captions`); at the bottom a glass control bar (1200 px max): a chapter scrubber (one segment per step, proportional to travel plus dwell, with fill and a thumb; hover shows `2 · <caption or screen name>`; click or drag seeks to a step boundary and replays that step from its start), Previous and Next step, a big blue Play/Pause, `m:ss / m:ss`, the Captions switch, speed `0.5x 1x 2x` and Fullscreen (the Fullscreen API on the player container).
- **Keys.** `Space` play/pause, `Left`/`Right` previous/next step, `C` captions, `F` fullscreen, `Esc` exit.
- **End card** after the last step: `That was: <name>`, `Up next: <next>, starting in 5 s` (any key or click cancels the countdown) and **Replay**, **Next scenario**, **Try it yourself (Play)** (Play at the scenario's last screen). **Play all** continues with no end card between scenarios; the last one shows it without a next.

All timing lives in `web/watch.ts` (timeline of per-step travel and dwell, `positionAt`, step seeking, chapter fractions, labels, the link-finding predicate, play-all sequencing, the end card countdown; `test/watch.test.ts`); `web/watch-view.ts` is the DOM.

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
- `web/play.ts` is the pure Play logic (back stack, next screen, transition resolution and planning, spatial focus, stage fit, dots, key intents, the sandbox string), unit tested in `test/play.test.ts`; `web/play-view.ts` draws it and exposes `goto(screenId, transition?)` for remote control and a `userAction` hook for viewer moves. `web/follow.ts` is the pure follow and tour logic (unit tested in `test/follow.test.ts`), `web/live-view.ts` draws the pill, the Follow and Tour buttons and the caption.
- `web/landing.ts` is the pure landing logic (entries, badges, filters, search, flat sorting, project dropdown, relative meta line, thumbnail fit, last-opened store, presenter sessions and banner), unit tested in `test/landing.test.ts`; `web/landing-view.ts` draws it (lazy thumbnails, banner, Continue strip, gallery). Its CSS is the delimited "landing page" block in `public/index.html`.
- `web/walk.ts` is the pure walkthrough logic (steps from the tour or the screens, header, stepping, auto-advance on the tour clock of `web/follow.ts`, spotlight target and callout placement), unit tested in `test/walk.test.ts`; `web/walk-view.ts` draws the rail, pill, spotlight and callout over the play view (`setInset` keeps room for the rail, `links` gives the link boxes).
- `web/watch.ts` is the pure scenario-player logic (timeline, positions, seeking, chapters, labels, link picking, play all, end card), unit tested (`test/watch.test.ts`); `web/watch-view.ts` draws the picker and the player.
- `web/replay.ts` is the pure replay logic (event index, stepping, playback timing, ticks, labels, keys), unit tested (`test/replay.test.ts`); `web/replay-view.ts` draws the replay layer and bar (see [Canvas and screens](canvas.md)).
- Project details come from `GET /api/projects/<id>` (see [the API](api.md)).
