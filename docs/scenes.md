---
sidebar_position: 11
slug: /scenes
---

# 3D scenes and films (model, store, tools and the Orbit viewer)

A project holds **scenes**; a scene holds objects, lights, a sky and a default camera, plus up to eight **films** (shot lists that move a camera through it). Claude writes scenes as plain JSON with MCP tools. A scene is **data only**: no Claude-written code runs anywhere, and there is no game logic, physics, external model or texture in this version. The watch page draws a scene with its own bundled renderer (see [Renderer](#renderer)) and lets you orbit it at `#/project/<id>/scene/<sid>` (see [The watch page](ui.md#scenes)) and scroll its page at `#/project/<id>/scene/<sid>/page` (see [Page mode](ui.md#page-mode)); film playback (Watch) builds on the same renderer. The landing page shows scenes as cards beside the designs.

The code is `src/scene.ts` (model, `checkScene`, repeaters), `src/shots.ts` (films, `checkFilms`), `src/scene-validate.ts` (`validateScene`) and `src/scene-store.ts` (the only code that touches the table), with thin Hub, MCP and API wiring.

## Scene

```ts
type Vec3 = [number, number, number];
type Material = { color: string; roughness?: number; metalness?: number; emissive?: string; opacity?: number };
type SceneObject = {
  id: string;
  kind: "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "capsule" | "text" | "group" | "repeat" | "terrain";
  name?: string; pos?: Vec3; rot?: Vec3; scale?: Vec3; size?: number[]; material?: Material; text?: string;
  children?: SceneObject[];
  repeat?: { mode: "grid" | "ring" | "scatter"; count: number; spacing?: number; radius?: number; seed?: number; of: SceneObject };
  terrain?: { size: [number, number]; height: number; scale: number; octaves: number; seed: number };
};
type Light = { id: string; kind: "sun" | "ambient" | "point" | "spot"; color: string; intensity: number; pos?: Vec3; target?: Vec3 };
type Sky = { top: string; bottom: string; fog?: { color: string; near: number; far: number } };
type View = { pos: Vec3; look: Vec3 | string };            // a string is an object id
type Scene = { name: string; objects: SceneObject[]; lights: Light[]; sky: Sky; camera: View & { fov: number } };
```

- `size` has a fixed layout per kind (`SIZE_LAYOUT` in `src/scene.ts`); every value is 0 or more, and a list of the wrong length, a negative value or a size on a kind without one is rejected naming the path (`objects[0].size`). A missing size is 1 (cylinder, cone and capsule height 2, torus tube 0.3).

  | kind | `size` |
  |---|---|
  | `box` | `[width, height, depth]` |
  | `sphere` | `[radius]` |
  | `cylinder`, `cone`, `capsule` | `[radius, height]` |
  | `torus` | `[radius, tube]` (ring radius, tube radius) |
  | `plane` | `[width, depth]` |
  | `text` | `[height]` (letter height) |
  | `group`, `repeat`, `terrain` | none (`terrain.size` is `[width, depth]` inside `terrain`) |

- Colours are `#rrggbb`. `roughness`, `metalness` and `opacity` are 0 to 1. `rot` is in degrees.
- Every number must be finite and sane (no NaN, Infinity or 1e12). The error names the path, for example `objects[0].pos[1]`.
- A **group** places `children` under its own `pos`, `rot` and `scale`; the renderer applies group transforms.
- A **repeater** (`kind: "repeat"`) copies `repeat.of` by `mode`: `grid`, `ring` (around `radius`) or `scatter` (seeded, so the same `seed` always gives the same layout; no `Math.random`). Copies get ids `<id>#<n>` (`tower#0` to `tower#8`), and children of a copied group get the same suffix. A repeater inside a repeater adds one `#<n>` per level, outermost first: outer copy 1, inner copy 0 of template `c` is `c#1#0`, so every expanded id is unique and the same for the same scene. `expandObjects` returns the expanded tree (groups stay as nodes) and refuses, before building anything, input that would pass the object limit. Expanded copies are not declared ids: a shot cannot look at `tower#3`, only at `tower`.
- **terrain** is a grid of about one vertex per world unit (16 to 128 segments a side) whose height is `height` times fractal value noise (`octaves` layers, each twice as fine and half as strong, seeded by `seed`); `scale` is the size of the largest hills in world units. **text** is a flat label that always faces the camera, `size[0]` units per letter, in the material colour.
- A scene with zero objects is valid (a sky and lights alone). `validate_scene` reports it as an info note, never an error.
- `look` as a string must be the id of a declared object (`objectIds`: every id in the scene, including nested children and `repeat.of`, not expanded copies).

## Shots and films

```ts
type Shot = {
  id: string; name: string; from: View; to: View;
  waypoints?: Vec3[];                  // at most 8
  duration_ms: number;                 // 500 to 60000
  ease?: "linear" | "in-out" | "out";
  caption?: string;                    // plain words, at most 200 characters
  focus?: string;                      // an object id
};
type Film = { id: string; name: string; description?: string; shots: Shot[] };
type FilmRead = Film & { duration_ms: number; missing: number[] };
```

A shot moves the camera from `from` to `to` (through `waypoints`, if any) over `duration_ms`. `focus` and any string `look` must name an object that exists when the films are set (`checkFilms` throws `film "<id>" shot <n>: ...`). `FilmRead` adds the total `duration_ms` and `missing`: the indexes of shots whose `focus` or look-at object has since been removed or renamed. Removing an object a shot points at is allowed (`patch_scene` succeeds, nothing throws); `read_scene` lists the shot under `missing` and `validate_scene` reports `shot_looks_at_nothing` (a look-at) or `focus_missing` (a focus).

### Shot timeline

`web/shots-play.ts` (pure, no DOM) is how the viewer plays a film:

- `ease(kind, t)`: `linear`, `in-out` (cubic, 0.5 at 0.5) or `out` (0.875 at 0.5); t is clamped, NaN is 0.
- `pathSample(from, waypoints, to, t)`: a uniform Catmull-Rom spline through from, waypoints and to; each segment gets an equal share of t, so waypoint k of n is hit exactly at t = k / (n + 1). No waypoints is a straight line.
- `sampleShot(shot, t, objectCenter)` returns `{pos, look, fov?}`: eased path for `pos`, eased blend of the two look points. Look-at objects are resolved on every call by `resolveLook(view, objectCenter, fallback)`; a vanished object falls back to the other end's look, then to the origin. t 0 and 1 equal the views exactly.
- `buildFilmTimeline(film)`: shots are back to back with their exact durations (no cross-hold): `{total_ms, starts}`. `filmPositionAt(film, ms)`: a boundary belongs to the next shot, at the total `done` is true; `seekToShot` gives a shot's start; `chapterFractions` sum to 1.
- `filmLabel` ("5 shots · about 40 s"), `captionFor(shot, on)`, `playAll(films, i)` and the end card countdown (reused from `web/watch.ts`).
- `focusRing(shot, msInShot)`: alpha fades in over the first 500 ms and out over the last 500 ms of the shot (shorter shots peak below 1); no `focus` means no ring.

## Renderer

The watch page draws scenes with **Three.js** (MIT, `three@0.187.0`, the one runtime dependency added for 3D), bundled by `npm run build:web` and loaded only when a scene route opens. Decided by the spike (task #2008) on 2026-11-06: **keep Three.js**.

| Check | Result |
|---|---|
| CSP (`script-src 'self'`, no eval, no remote scripts) | Passes. The chunk contains no `eval` or `new Function`; the scene route logs no CSP violation (the only eval refusal on the page is the shader backdrop's, on other routes, as before). Shaders are compiled by WebGL, not by `eval`. |
| Lazy chunk size (minified, the `npm run deploy` build) | Three.js plus `web/scene-render.ts`: 550 KB, **141 KB gzipped** (budget about 600 KB gzipped). The Orbit DOM (`web/scene-view.ts`) is 4.3 KB (2.1 KB gzipped) and the shared pure code (`src/scene.ts`, `web/scene-math.ts`) 11 KB (4.4 KB gzipped). `page.js` imports none of it: other routes never download it. Imports come from `three` only (no examples or addons). |
| Idle GPU | Frames are drawn only on change (camera moved, resize, live edit): 0 draw calls while idle, measured by counting WebGL draw calls in Chrome. |
| Hidden tab | No frames while `document.hidden`: 0 draw calls while hidden even with the camera moving; one catch-up frame when the tab shows again. |
| No WebGL | `web/webgl.ts` checks for WebGL 2 before Three.js is downloaded; without it the view shows a message and a still poster (the last rendered still, cached in this browser, else the sky gradient with the scene name). Forced by hand with local storage `lite.scene.nowebgl = "1"`. |

How the data is drawn (`web/scene-render.ts`; the maths is pure in `web/scene-math.ts`, unit tested in `test/scene-math.test.ts`):

- **Primitives** share one geometry per kind and size and one `MeshStandardMaterial` per material (colour, roughness default 0.8, metalness default 0, emissive, opacity: below 1 is transparent). Planes lie in the XY plane and are double-sided (`rot: [-90, 0, 0]` lays one flat); a capsule's height is its whole length. Without a material an object is light grey.
- **Groups** are Three.js groups with their `pos`, `rot` (degrees, XYZ order) and `scale`.
- **Repeaters** are expanded with `expandObjects`. A repeater whose template is one primitive is a single instanced mesh (one draw call for all copies); other repeaters (of a group, text or terrain) are plain meshes that share geometry and materials. The repeater's own `pos`, `rot` and `scale` wrap its copies.
- **Lights**: `sun` is a directional light from `pos` towards `target` with soft shadows (a 2048 shadow map fitted to the scene's bounds); `ambient` lights everything evenly; `point` and `spot` (a cone 30 degrees off its axis, soft edge) fall off with distance, `intensity` 1 lighting roughly 10 units around. Every opaque solid casts and receives shadows.
- **Sky** is a large gradient dome around the camera: `bottom` at and below the horizon easing to `top` overhead, shown as written (not tone mapped). **Fog** is linear from `near` to `far`. Colours are sRGB, output is ACES tone mapped.
- **Camera**: `fov` is vertical, in degrees; a string `look` aims at the centre of that object's bounds (a repeater template id aims at the whole repeater).
- Frames are drawn on demand only, never while paused or while the tab is hidden; `poster()` draws one frame and returns a JPEG data URL.

The API other modes build on:

```ts
// web/scene-render.ts (import it with import(); check hasWebGL2() from web/webgl.ts first)
type CameraView = View & { fov?: number };
function createSceneView(container: HTMLElement, scene: Scene): SceneView; // throws without WebGL 2
interface SceneView {
  readonly canvas: HTMLCanvasElement;
  setCamera(view: CameraView): void;         // schedules one frame
  camera(): { pos: Vec3; look: Vec3; fov: number };
  lookPoint(look: Vec3 | string): Vec3;       // an object id -> the centre of its bounds
  render(): void; resize(): void; pause(): void; resume(): void;
  poster(): string;                            // JPEG data URL of a frame drawn now
  dispose(): void;
}
```

## Limits

| What | Limit |
|---|---|
| objects after repeaters expand: every node, groups and repeater copies included (a copied group with one child is 2) | 2000 (`SCENE_OBJECTS_MAX`) |
| any number, and every repeater copy's position | within ±1,000,000 (`SCENE_NUMBER_MAX`) |
| scene JSON | 200,000 bytes (`SCENE_BYTES_MAX`) |
| group nesting depth | 6 (`SCENE_NESTING_MAX`) |
| ids (scene, object, light, film, shot) | slug `[a-z0-9-]`, up to 40 characters |
| names | 80 characters (`SCENE_NAME_MAX`) |
| captions | 200 characters |
| films per scene | 8 (`FILMS_MAX`) |
| shots per film | 30 (`SHOTS_MAX`) |
| shot duration | 500 to 60000 ms (`SHOT_MS_MIN`, `SHOT_MS_MAX`) |
| waypoints per shot | 8 |

The expanded count is computed arithmetically from the declared tree (nothing is expanded to measure it), so a repeater of an empty group or nested repeaters with a tiny payload are counted in full. A repeater (or group) that would pass the object limit is rejected before anything is stored, naming the object id and the expanded count (`repeater "forest" expands to 2001 objects (limit 2000)`). A repeater whose copies could land beyond ±1,000,000 on any axis (its `pos`, shifted by any outer repeater, plus its grid extent or ring/scatter radius plus the template `pos`) is rejected naming its id. Duplicate ids anywhere (including across nested groups) are rejected naming the id. Nesting deeper than 6 is rejected.

## Tools

All take `project`; errors are `isError` results. Validation is done by the pure modules, so the MCP schemas accept `data`, `films` and `edits` as loose JSON.

| Tool | Input | Answer |
|---|---|---|
| `create_scene` | `name`, `id?` | `{scene: SceneSummary}`; an existing id is an error |
| `set_scene` | `scene`, `data` (a Scene) | `{scene: SceneSummary}`; replaces the whole scene (films stay) |
| `patch_scene` | `scene`, `edits:[{op: "set"\|"remove", id, object?}]` | `{scene: SceneSummary}`; edits top-level or nested objects by id (`set` replaces, or adds a top-level object when the id is new; `remove` needs an existing id), re-checks the whole scene |
| `set_films` | `scene`, `films` (at most 8) | `{scene, count}`; replaces all films |
| `set_page` | `scene`, `page` (`{sections}`, or null/`{}` to clear) | `{scene, sections}`; replaces the page (see Page) |
| `read_scene` | `scene` | `{scene: Scene, films: FilmRead[], page: Page \| null, updated_at}` |
| `list_scenes` | none | `{scenes: SceneSummary[]}`: `{id, name, objects, drawables, films, updated_at}`, newest first |
| `validate_scene` | `scene` | `{ok, issues:[{severity, kind, message, fix, object?, film?, shot?}]}` |
| `review_scene` | `scene` | `{scene, score, ok, issues:[{severity, kind, message, fix, object?, film?, shot?}], stats:{objects, lights, colors, films, shots, duration_ms, shown, unshown, captioned_shots}}` |

`SceneSummary` is `{id, name, objects, drawables, films, updated_at}`: `objects` counts the declared top-level objects only (a group or a repeater is 1), `drawables` the nodes after repeaters expand (groups and copies included; the number the 2000 limit applies to). The page API (`GET /api/projects/<id>/scenes`, see [API](api.md)) answers the same summaries.

A `patch_scene` `set` also finds an id inside a repeater's template (`repeat.of`, at any depth) and replaces it there instead of appending a duplicate; removing a template itself is an error (set a new template, or remove the repeater). `create_scene` on the id of a removed scene revives that row in place (new data, no films); rows are never deleted.

`validate_scene` kinds: `camera_inside_solid` (error; a shot's `from` or `to` position lies inside an object's axis-aligned bounding box, estimated from `size`, `scale` and `pos` with group offsets summed, rotation ignored), `shot_looks_at_nothing` (error; `look` is an id that does not exist), `focus_missing` (error; `focus` is an id that does not exist), `no_lights` (warning), `film_too_short` (warning; under 3000 ms in total), `empty_scene` (info). `ok` means no errors. Build lights and a sky, write 2 to 4 films with captions in plain words, run `validate_scene` and fix every issue before showing anything.

`review_scene` (`src/scene-review.ts`, pure `reviewScene({scene, films})`) asks whether the scene is composed, lit and filmed like a finished piece, which `validate_scene` does not. It returns everything `validate_scene` reports plus: `unseen_object` (warning; no shot shows the object: it is outside the camera view at the start, end and along the path of every shot, estimated with a bounding sphere against a view cone of the scene's `fov` at 16:9, 9 samples per shot; an id named by any `focus` or look-at, or a group id that does, counts as shown; repeater copies report once under the template id), `flat_palette` (warning; 4 or more objects share one material colour, objects without a material count as one colour), `flat_sky` (warning; `sky.top` equals `sky.bottom`), `path_through_solid` (warning; one of 23 interior samples along a shot path lies inside an object's bounding box, the end points stay `camera_inside_solid` errors), `thin_film` (warning; a film with one shot), `no_films` (info; objects but no films: write 2 to 4), `missing_caption` (info; per shot) and `static_shot` (info; `from` equals `to` with no waypoints). `film_too_short` and `no_lights` come from `validate_scene`. `score = max(0, 100 - 15 per error - 6 per warning - 1 per info)`; `ok` means no errors and no warnings (info never blocks). Run it after `validate_scene` and keep fixing until `ok` and `score >= 90` before showing anything. The Claude Code plugin ([Plugin](plugin.md)) packages the process as the `lite-scenes` skill and a `/scene` command.

Errors reuse `unknown project "<id>"` and add `unknown scene "<id>"`.

## Page

A **page** turns a scene into a scrolling landing page: the camera follows the scroll and text overlays sit on top. It is data too: `{sections: Section[]}`, stored on the scene (`page` column, migration 8) and set with `set_page`. Code: `src/page-model.ts` (`checkPage`, `pageCoverage`, `unsafeHtml`) and `web/page-scroll.ts` (the pure scroll mapping the browser and the tests share).

A section is `{id, title?, html, shot, align?, height_vh?, gap_vh?}`:

| Field | Meaning |
|---|---|
| `id` | slug, unique in the page |
| `title` | optional, at most 80 characters |
| `html` | the overlay content; shown later in a sandboxed frame, so text and markup only |
| `shot` | a shot id of any film of the scene, or a pair `[first, second]` of shot ids |
| `align` | `left`, `right` or `center` (where the overlay sits) |
| `height_vh` | scroll length of the section, 50 to 300, default 100 |
| `gap_vh` | scroll distance before the section, 0 to 100, default 0 |

**Mapping rules** (`cameraAt(page, films, scrollY, viewportHeight)`). Sections are consecutive: section n starts where section n-1 ended plus its own `gap_vh`. A section bound to one shot plays that shot from start to end across its scroll range (progress = how far through the range, eased like the shot player). A pair moves from the first shot's start view to the second shot's end view (the first shot's easing, no waypoints). In a gap between sections the camera holds the previous section's end view. Before the first section it sits at the first section's start view; after the last it holds the last end view. A section whose shot no longer exists is skipped.

**Limits:** at most 12 sections; html at most 20000 bytes per section and 100000 per page; title 80 characters. Overlay html is rejected, naming the section, when it contains `<script>`, an `on*` attribute, a `javascript:` url, or `<iframe>`, `<object>`, `<embed>` or `<form>`. Every referenced shot id must exist in some film (`invalid section "<id>": unknown shot "<id>"`). `set_page` checks against the stored scene and films, so set films first. Setting new films later does not re-check the page; `cameraAt` skips dead shots and `pageCoverage` lists shots no section uses (information for the review, never an error).

Write sections like a landing page: a headline, one idea per section, each bound to a shot; run `validate_scene` and `review_scene` first.

**Viewer.** The watch page plays a page at `#/project/<id>/scene/<sid>/page` ([Page mode](ui.md#page-mode)): the scroll offset of a transparent container over the renderer is fed to `cameraAt`, string look-at ids are resolved to points with the renderer's `lookPoint` first so looks blend, and each section's html is shown in a `sandbox=""` srcdoc frame (no scripts, no same-origin) in a glass card of fixed height `min(70vh, 520px)` (the frame cannot be measured from outside, so it does not grow with its content; write overlays that fit). The pure layout helpers are in `web/scene-page.ts`.

## Events

Envelope and replay are the usual (see [Progress](progress.md)). **No event carries a scene body.**

| kind | payload | When |
|---|---|---|
| `scene.set` | `{scene, name, bytes}` | `create_scene`, `set_scene`, `patch_scene` |
| `films.set` | `{scene, count}` | `set_films` |
| `page.set` | `{scene, sections}` (no html) | `set_page` |
| `scene.removed` | `{scene}` | reserved: not emitted yet (no tool removes a scene in this version) |

## Storage

Migration 8 adds the `page` column (JSON text, `'null'` when there is no page). Migration 7 adds the `scenes` table, keyed by `(project, id)`: `name`, `data` (the scene JSON), `films` (the films JSON, default `'[]'`), `updated_at` and `removed` (0 or 1). See [Database](database.md). Writes check the whole input first and store it with its event in one transaction; `patch_scene` writes the whole checked scene back, never a partial one.

## Worked example: a small town

A square, a church, nine houses in a 3 by 3 grid, a ring of trees, a sun and an ambient light, and a dusk sky with fog. Every id is a slug, every colour is `#rrggbb`, and the cameras stay outside the objects.

```json scene
{
  "name": "Small town",
  "objects": [
    { "id": "ground", "kind": "plane", "name": "Ground", "size": [120, 120], "rot": [-90, 0, 0],
      "material": { "color": "#6b8f5a", "roughness": 1 } },
    { "id": "square", "kind": "cylinder", "name": "Town square", "pos": [0, 0.1, 14], "size": [8, 0.2],
      "material": { "color": "#b9ad98", "roughness": 0.9 } },
    { "id": "church", "kind": "group", "name": "Church", "pos": [22, 0, -8],
      "children": [
        { "id": "church-hall", "kind": "box", "pos": [0, 3, 0], "size": [7, 6, 10],
          "material": { "color": "#d8cfc0", "roughness": 0.8 } },
        { "id": "church-tower", "kind": "box", "pos": [0, 7, -3], "size": [3, 14, 3],
          "material": { "color": "#cfc5b4", "roughness": 0.8 } },
        { "id": "church-spire", "kind": "cone", "pos": [0, 16, -3], "size": [2.4, 4],
          "material": { "color": "#7a3b2e", "roughness": 0.6 } }
      ] },
    { "id": "houses", "kind": "repeat", "name": "Houses", "pos": [-12, 0, -14],
      "repeat": { "mode": "grid", "count": 9, "spacing": 10,
        "of": { "id": "house", "kind": "box", "pos": [0, 2, 0], "size": [5, 4, 5],
          "material": { "color": "#e2b88a", "roughness": 0.7 } } } },
    { "id": "trees", "kind": "repeat", "name": "Trees around the square", "pos": [0, 0, 14],
      "repeat": { "mode": "ring", "count": 12, "radius": 9,
        "of": { "id": "tree", "kind": "cone", "pos": [0, 2, 0], "size": [1.6, 4],
          "material": { "color": "#2f6b3a", "roughness": 0.9 } } } },
    { "id": "sign", "kind": "text", "name": "Welcome sign", "text": "Welcome", "pos": [0, 3, 28], "size": [2],
      "material": { "color": "#ffffff", "emissive": "#222222" } }
  ],
  "lights": [
    { "id": "sun", "kind": "sun", "color": "#ffd9a8", "intensity": 1.4, "pos": [40, 30, 20], "target": [0, 0, 0] },
    { "id": "fill", "kind": "ambient", "color": "#8aa4c8", "intensity": 0.5 }
  ],
  "sky": { "top": "#2c4a7a", "bottom": "#f0b27a", "fog": { "color": "#d8b894", "near": 40, "far": 160 } },
  "camera": { "pos": [0, 20, 55], "look": "square", "fov": 50 }
}
```

Three shots in one film: an arrival, a slow glide over the roofs, and a look at the church.

```json films
[
  {
    "id": "tour",
    "name": "Town tour",
    "description": "From the road into town, over the roofs, to the church.",
    "shots": [
      { "id": "arrive", "name": "Arrive", "duration_ms": 6000, "ease": "out",
        "caption": "We arrive from the road and see the town square.",
        "focus": "square",
        "from": { "pos": [0, 6, 60], "look": "square" },
        "to": { "pos": [0, 6, 36], "look": "square" } },
      { "id": "roofs", "name": "Over the roofs", "duration_ms": 8000, "ease": "in-out",
        "caption": "The camera rises and drifts past the nine houses.",
        "focus": "houses",
        "from": { "pos": [-30, 8, 20], "look": "houses" },
        "waypoints": [[-34, 14, 0], [-30, 18, -20]],
        "to": { "pos": [-6, 18, -40], "look": "houses" } },
      { "id": "church", "name": "The church", "duration_ms": 7000, "ease": "in-out",
        "caption": "Last, the church tower in the evening light.",
        "focus": "church",
        "from": { "pos": [36, 8, 14], "look": "church" },
        "to": { "pos": [34, 12, -26], "look": "church" } }
    ]
  }
]
```

`test/scenes-doc.test.ts` extracts the two blocks above by their fence strings (`json scene` and `json films`) and runs them through `checkScene` and `checkFilms`, so the example cannot drift from the code.
