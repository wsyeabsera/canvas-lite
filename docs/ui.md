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
| `#/project/<id>/scene/<sid>` | A 3D **scene** in Orbit mode (see [Scenes](#scenes)). |
| `#/project/<id>/scene/<sid>/watch[/<filmId>]` | The scene in **Watch** mode: without a film id the film picker, with one the film player (see [Watch mode](#watch-mode-films)). |
| `#/project/<id>/scene/<sid>/page` | The scene's scrolling **page**: scroll drives the camera, text overlays on top (see [Page mode](#page-mode)). |

The project page also has a **Canvases** card, but nothing in the UI links to it any more: the page shows designs only. There is no sidebar on any view. The activity and project pages are full-width under the top bar (a **Designs** back arrow to `#/`, the wordmark, status, the docs link and the theme pill); the canvas's top-left pill shows the design name with a back arrow to `#/`.

The page targets desktop browsers; narrow screens are not a goal yet.

## Landing

`#/` is a gallery, not a console: no files, events or raw activity on it. A top row has the **Lite** wordmark, the **project switcher**, a rounded glass search box ("Search designs": every word must appear in the design name; `Esc` clears) and the theme pill with the docs link. **The page shows one project at a time**: under the top row sit the project's name as a heading and a line like `8 designs · 3 scenes`, then its chips and gallery. Nothing from another project is drawn (not the gallery, the counts, search, or the Continue strip); a new project starts empty.

The switcher (a glass pill with the project name, always visible once Lite knows a project) opens a native popover listing **every** project (empty ones too) as `name` and `8 designs · 3 scenes` or `empty`, the current one ticked, and a **+ New project** row. That row opens a dialog saying projects are created by Claude (the page only reads) with a line to say, such as `open a Lite project called "billing"`; the project appears in the list as soon as Claude creates it. The choice is remembered in local storage (`lite.project`) and falls back to the first project (by name) when that project is gone. Choosing a project clears the search and filter. There is no "All projects" view.

- **Claude is presenting.** While a `presenter.*` session is active in any project (folded from the events the page already receives, across projects) a glass banner shows a green dot, `<canvas name>, step n of m` and a blue **Watch live** button that opens Play on that canvas.
- **Continue.** One wide card for the last design you opened: a 213 x 118 live thumbnail of its start screen, the name, `12 screens · you stopped at <screen> · 5 min ago`, a blue **Play** (resumes at that screen) and an outlined **Walkthrough**. Opening a canvas, screen or Play route remembers `{project, canvas, screen, ts}` in local storage (`lite.last`); Play remembers each screen it moves to. Hidden when nothing was opened yet or the canvas is gone.
- **Designs.** Quiet chips **All N**, **Playable N**, **Needs links N**, then one flat 4-column gallery of glass cards sorted by last update, newest first (no project headings). A card has a 150 px thumbnail (the canvas start screen, else its first screen), the name, `N screens · updated 1 h ago` and a badge: green **Playable** when the canvas has screens, no dangling link and no unlinked control, amber **N missing links** (dangling links plus unlinked controls, the counts of `validate_flow` and the write-time warning), grey **No screens** for an empty canvas (counted only under All). Hover or keyboard focus dims the thumbnail and shows **Play** (`#/project/<id>/canvas/<cid>/play`) and **Walkthrough** (the `/walk` route); a click anywhere else on the card opens the canvas.
- **Scene cards.** 3D scenes (`GET /api/projects/<id>/scenes`, fetched per project next to the canvases) sit in the same flat grid, sorted by update with the designs; the project scoping and search (the scene name and the words `3d` and `scene`) apply to them too. A scene counts as **Playable** and never as **Needs links** (it has no screens or links; the scene review is not run here). The card shows the meta `28 objects · updated 1 h ago` (objects after repeaters expand), a **3D scene** badge and chips **N films** and **Page** (Page once the card's scene detail shows a page). The thumbnail starts as the scene's sky gradient with its name; once the card scrolls into view the scene (`GET /api/projects/<id>/scenes/<sid>`) is fetched and a still **poster** is shown: the one cached in local storage under `lite.scene.poster.<project>/<scene>` (the key the Orbit view writes) when fresh, else one rendered in the browser with the scene renderer offscreen (480 x 270, at most **2 at a time**, never while the landing or the tab is hidden) and cached under the same key with its scene version in `lite.scene.posterAt.<project>/<scene>` (a poster with no version, written by Orbit, is accepted; a versioned one older than the scene is redrawn). Without WebGL 2 the sky gradient stays. Hover shows **Watch** (only with films; `#/project/<id>/scene/<sid>/watch`, the film player), **Page** (only with a page) and **Orbit**; a click anywhere else opens Orbit. Scene events (`scene.set`, `films.set`, `page.set`) refresh the list.
- **Thumbnails** are the screen in `<iframe sandbox="" srcdoc>` (the same empty sandbox as the canvas: no scripts, no same-origin), `pointer-events: none`, scaled with a CSS transform to fit (`thumbFit`). They are fetched lazily when a card scrolls into view (`GET /api/projects/<id>/canvases/<cid>`) and cached per canvas version (`updated_at`); the link counts come in the one list per project.
- **Empty.** A project with no design or scene (shown once the first websocket backfill had time to arrive): `Nothing yet in billing. Ask Claude to design something.`
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

## Scenes

`#/project/<id>/scene/<sid>` (`{view: "scene", id, scene}` in `web/state.ts`, `hrefScene`, `routeScene`) shows a 3D scene (see [3D scenes](scenes.md)) full window, read only, in **Orbit** mode. The landing page's scene cards open it.

- The scene comes from `GET /api/projects/<id>/scenes/<sid>` with the page's token and is drawn by Lite's renderer (Three.js, loaded only on this route).
- **Orbit.** Drag to orbit around the point the camera looks at (dragging never takes the camera below that point's level), scroll to zoom, `Shift`-drag or right-drag to pan. `R` goes back to the scene's own camera. A glass hint at the bottom lists these.
- A glass chip top left shows the scene name, the mode segments **Orbit | Watch | Page** (links to the three routes, the one on show highlighted; drawn from `SCENE_MODES` in `web/scene-modes.ts` in `web/scene-view.ts` so another mode is one line) and **Exit** (`Esc` too), which goes back to the landing page `#/`.
- **Live.** A `scene.set` or `films.set` event for the scene on show refetches it and redraws; a camera you moved stays where it is.
- Frames are drawn only when something changes and never while the tab is hidden; the shader backdrop is paused while a scene is open.
- **No WebGL.** Without WebGL 2 the page says so and shows a still poster: the last still this browser rendered of the scene (cached in local storage as `lite.scene.poster.<project>/<scene>`), else the scene's sky gradient with its name. Setting local storage `lite.scene.nowebgl` to `"1"` forces this, to check it by hand.
- An unknown scene shows `No scene "<id>" in this project.`

## Page mode

`#/project/<id>/scene/<sid>/page` (`{view: "scene-page", id, scene}`, `hrefScenePage`) plays the scene's page (`set_page`, see [3D scenes](scenes.md#page)) like a scrolling landing page.

- **Layers.** The renderer is fixed full window behind. On top, a transparent scroll container whose track is as tall as the sections' scroll ranges (`sectionRanges`: each `gap_vh` then `height_vh`, in px of the window height) plus one window, so the last section scrolls to its end. The page's own scrollbar is hidden; the wheel, trackpad, arrow keys, Space and Page Down scroll it.
- **Camera.** On scroll (once per animation frame) the view calls `cameraAt(page, films, scrollTop, windowHeight)` (`web/page-scroll.ts`) and `setCamera` with the scene's `fov`. String look-at ids are resolved to points with the renderer's `lookPoint` before mapping (`resolveFilmLooks`), so a look moving between two objects blends smoothly; any id left over is resolved the same way.
- **Overlays.** Each section's `html` is shown in its own frame `<iframe sandbox="" srcdoc referrerpolicy="no-referrer">`: **no `allow-scripts`, no `allow-same-origin`**; Claude's html never enters the page's DOM. The srcdoc wraps it in a transparent, non-scrolling document with a light text style (`overlaySrcdoc`). The frame sits in a glass card in a column left, right or centre (`align`, default left), sticky in the window while its section scrolls. Because the frame is cross-origin to the page, its content height cannot be measured: the card has a fixed height of `min(70vh, 520px)`, at most 90% of its section's scroll length and at least 120 px (`cardHeight`), and the frame does not scroll inside, so long overlays are cut. The card takes the pointer, so its text can be selected; the wheel over it still scrolls the page.
- **Rail.** A thin line at the right edge with a dot per section placed at its start (`railDots`), the line filled to the scroll progress (`pageProgress`) and the current section's dot highlighted (`activeSection`). Hovering a dot shows the section title (`Section n` without one); clicking scrolls to the section start, smoothly, or instantly under `prefers-reduced-motion`.
- **Chip.** The same glass chip as Orbit: the scene name, the **Orbit | Page** segments (Page highlighted) and **Exit** (`Esc` too), which returns to Orbit.
- **No page.** When `page` is null a glass card says "This scene has no page yet. Ask Claude to add one with set_page." with an **Open in Orbit** button.
- **Live.** `scene.set`, `films.set` and `page.set` for the scene refetch it; the scroll position is kept and the frames are rebuilt only when the page changed.
- **No WebGL.** The sky gradient (or the cached poster) stays behind and the overlays still scroll; a hint says the camera cannot move.
- Pure layout in `web/scene-page.ts` (unit tested, `test/scene-page.test.ts`), DOM in `web/scene-page-view.ts` (imported lazily, like Orbit). CSS: the delimited "3D scene, Page mode" block of `public/index.html`.

### Watch mode (films)

`#/project/<id>/scene/<sid>/watch[/<filmId>]` (`{view: "scene-watch", id, scene, film}`, `hrefSceneWatch`) plays the scene's films (see [3D scenes](scenes.md), Films) like the scenario player plays scenarios: the same near-black glass look, bar and keys.

- **Picker** (`/watch`): the mode chip top left, a small caps line `<scene name> · N films · about 1 min 40 s`, the title "Pick a film to watch", a 2-column grid of glass cards (a 300 x 169 poster, a `m:ss` duration chip, a round play badge, the name, the description, `N shots`) and a blue **Play all, one after another**. The poster is a frame rendered from the film's first shot's start camera (one offscreen renderer draws every poster, then is freed); without WebGL 2 it is the scene still Orbit cached in this browser, else the sky gradient. `Esc` returns to Orbit.
- **Player** (`/watch/<filmId>`): the 3D view fills the window. A clock (the scenario player's `tick` and speeds) moves a playhead through the shots back to back; each frame the camera is `sampleShot` of the shot under the playhead (`filmPositionAt`), look-at objects resolved by the renderer's `lookPoint`. Top left the mode chip and under it a blue chip `Shot 2 · The gate`; top right `<film> · Film i of n` and **Films** (the picker). The caption is a dark glass subtitle at the bottom centre while **Captions** is on (local storage `lite.watch.captions`, shared with the scenario player).
- **Focus ring.** When the shot has a `focus` object, a blue-glow rounded ring is drawn over the object: its world bounding box (`SceneView.bounds`) is projected to the screen with the camera just set (`screenBox` in `web/scene-math.ts`, padded 10 px, at least 36 px a side, clipped to the window, hidden when the object is behind the camera or off screen). It fades in over the shot's first 500 ms and out over its last 500 ms (`focusRing`).
- **Bar.** The scenario player's glass bar: a chapter scrubber with one segment per shot proportional to its duration (fill and thumb; hover shows `2 · <caption or shot name>`; click or drag seeks to the start of the shot under the pointer), Previous and Next shot, the big blue Play/Pause, `m:ss / m:ss`, the Captions switch, speed `0.5x 1x 2x` and Fullscreen.
- **Keys.** `Space` play/pause, `Left`/`Right` previous/next shot, `C` captions, `F` fullscreen, `Esc` back to the picker (from the picker: to Orbit).
- **End card**: `That was: <film>`, `Up next: <next>, starting in 5 s` (any key or click cancels) and **Replay**, **Next film**, **Explore (Orbit)**, which opens Orbit with the camera where the film ended (`handOffCamera` in `web/scene-view.ts`). **Play all** continues without an end card between films.
- **Reduced motion.** Each shot holds its start view instead of flying and fades in from black over 300 ms.
- **Hidden tab.** The clock and the drawing stop while the tab is hidden and resume where they were.
- **Live.** A `scene.set` or `films.set` for the scene refetches it: the film on show keeps its playhead (clamped to its new length), the renderer is rebuilt only when the scene itself changed; a film that was removed shows `This film does not exist.`; the picker redraws.
- The renderer is freed while the picker is on show (the posters are drawn once per scene version and kept in memory).

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
- `web/landing.ts` is the pure landing logic (entries and scene entries, badges, scene chips and hover actions, poster keys and freshness, filters, search, flat sorting, project switcher (summary, items, saved choice, scoping), relative meta line, thumbnail fit, last-opened store, presenter sessions and banner), unit tested in `test/landing.test.ts`; `web/landing-view.ts` draws it (lazy thumbnails, banner, Continue strip, gallery). Its CSS is the delimited "landing page" block in `public/index.html`.
- `web/walk.ts` is the pure walkthrough logic (steps from the tour or the screens, header, stepping, auto-advance on the tour clock of `web/follow.ts`, spotlight target and callout placement), unit tested in `test/walk.test.ts`; `web/walk-view.ts` draws the rail, pill, spotlight and callout over the play view (`setInset` keeps room for the rail, `links` gives the link boxes).
- `web/watch.ts` is the pure scenario-player logic (timeline, positions, seeking, chapters, labels, link picking, play all, end card), unit tested (`test/watch.test.ts`); `web/watch-view.ts` draws the picker and the player.
- `web/scene-math.ts` is the pure 3D maths (colours, default sizes, terrain noise, orbit camera), unit tested (`test/scene-math.test.ts`); `web/scene-render.ts` is the Three.js renderer and `web/scene-view.ts` the Orbit DOM, both loaded with `import()` only on a scene route (`web/webgl.ts` checks WebGL 2 before Three.js is fetched). Their CSS is the delimited "3D scene" block in `public/index.html`.
- `web/shots-play.ts` is the pure shot timeline and `web/scene-watch.ts` the pure Watch-mode rules (films from the API, labels, chips, scrubber seeking, previous and next shot, live clamping, reduced motion, the ring's box), unit tested in `test/shots-play.test.ts` and `test/scene-watch.test.ts`; `web/scene-modes.ts` lists the modes of the switch; `web/scene-watch-view.ts` is the Watch DOM (lazy, like Orbit). Its CSS is the delimited "3D scene modes switch" and "3D scene, Watch mode" blocks; it reuses the scenario player's `wt-*` classes.
- `web/replay.ts` is the pure replay logic (event index, stepping, playback timing, ticks, labels, keys), unit tested (`test/replay.test.ts`); `web/replay-view.ts` draws the replay layer and bar (see [Canvas and screens](canvas.md)).
- Project details come from `GET /api/projects/<id>` (see [the API](api.md)).
