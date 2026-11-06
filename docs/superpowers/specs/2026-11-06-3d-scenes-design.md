# 3D scenes: cinematic fly-throughs and 3D webpages

Status: approved by the owner on 2026-11-06. Mockups are still to be agreed before any building.

## Intent and why

Lite already lets Claude build clickable 2D prototypes, with Play, Walkthrough, and Watch (scenarios that play like a video).
The owner wants the same for 3D: Claude builds a 3D environment through the MCP, and the owner views it, read only, with
the same "press play and watch it" feel. The owner thinks of themselves as a movie producer, and later wants to use Lite to
design computer games, so what we build now should be the foundation for that.

Two things come first, and they are the same system viewed two ways:

1. **Cinematic fly-through.** A scene plus a shot list that plays like a film: camera moves, captions, a scrubber.
2. **3D webpage.** The same scene with ordinary page content laid over it; scrolling moves the camera between shots.

A walkable game level is the next step after these and is not part of this document.

## Model

- **Scene**: the world, written by Claude as plain data, never as code. Primitives (box, sphere, cylinder, cone, plane,
  torus, capsule), groups, repeaters (grid, ring and scatter, so a city or a forest is a few lines), a procedural terrain
  (noise parameters, not a heightmap file), 3D text labels, lights (sun, ambient, point, spot), a sky and fog, and
  materials (colour, roughness, metalness, emissive). One default camera.
- **Shot**: a camera move. It has a name, a start view and an end view (each a camera position and a look-at point, or a
  look-at object id), optional waypoints for a curved path, a duration, an easing, an optional caption, and an optional
  focus object that gets a highlight ring. A **film** is an ordered list of shots, and a scene can have several films
  (the same idea as several scenarios on a canvas).
- **Page** (3D webpage): ordered sections. Each section is bound to a shot (or a pair of shots) and carries HTML content
  shown over the scene, in the same locked-down way screens are shown today (sandboxed, no scripts). The scroll position
  maps to the camera position along the shots.
- **Viewing**: read only, on the website. Modes: **Watch** (a film plays), **Page** (scroll-driven), and **Orbit** (the
  viewer drags the camera). Same glass look as the rest of Lite, desktop only.

## Tools and skill (the Claude side)

Mirroring the 2D tools. Names are proposals.

- `create_scene`, `set_scene` (replace the whole world), `patch_scene` (change objects in place by id, like
  `patch_screen`), `read_scene`.
- `set_films` (shots, validated like scenarios), `set_page` (sections and overlays).
- `validate_scene`: hard checks (unknown object ids, a shot that looks at nothing, a camera inside a solid object, shots
  with no duration, limits exceeded).
- `review_scene`: the 3D counterpart of `review_prototype`, returning a score 0 to 100, issues and a fix for each:
  objects no shot ever shows, a flat grey world (no lights, no sky, one material), a path that passes through geometry,
  films shorter than a few seconds, a page whose sections do not cover all its shots, and so on. Claude is told to run it
  and keep fixing until it is clean before showing anything.
- A process skill, shipped in the same plugin as the prototyping skill: brief and shot list first, then an object
  inventory with lighting and sky decided up front, then one writing pass, then validate and review in a loop, then
  present. Anti-patterns listed (grey boxes, no lighting, a single shot).

## Goals

- The same loop as 2D: Claude writes, validates, reviews, and the owner presses play.
- Complete by default: the review pushes Claude toward lit, composed scenes, not grey boxes.
- A scene is a few KB of JSON that Claude can edit with small patches.
- Works on the deployed Worker with the existing token and live-follow ideas (Claude presenting a scene live is a
  natural later step).

## Non-goals (first version)

- No game logic, scripts, physics, collision, input handling or multiplayer. Walk mode is later.
- No editing UI on the page: it plays and watches, Claude writes through the MCP.
- No loading of external models or textures. Everything is built from primitives and procedural materials. This keeps
  the content safe and Claude's output predictable.
- No VR or AR. No phone or narrow screens. No video file export.

## Anti-goals (a failure even if it technically works)

- Running any Claude-written code in the page. Scenes are data drawn by Lite's own renderer.
- Burning the GPU while idle or in a background tab.
- Scenes that look like grey boxes on a grey floor.

## Constraints

- Content-Security-Policy stays `script-src 'self'`: the renderer is bundled with the page, no eval, no remote scripts.
- Desktop browsers only. WebGL is required; without it the viewer shows a clear message and a still poster.
- Unit tests only. The renderer is verified by hand once; everything else is pure and tested: scene and shot validation,
  camera path sampling and easing, the scroll-to-camera mapping, the review rules, and the data limits.
- No Shaders account (the existing `shaders` package rule stays).
- Docs change in the same commit as code, and the docs site must build.

## Decided with the owner

- The 3D webpage and the cinematic fly-through come first, as one system; the walkable game level comes after.
- Same design-first approach as the 2D work: mockups are agreed before building.
- Claude does all authoring; the page is read only.

## My calls (the owner has not decided these)

- The scene is data, rendered by a fixed renderer, rather than Claude-written code.
- The renderer is a bundled open-source 3D library (Three.js, MIT) loaded lazily, like the existing backdrop code, rather
  than hand-written WebGL. The builder confirms the size and CSP behaviour with a spike before committing to it.
- Scenes are event-sourced like scenarios and tours (no new table in the first version), with a size limit per scene.
- A scene appears on the landing page as a card beside the designs, with a rendered first frame as its thumbnail.

## Added after the builder check (answered by the project, or my calls)

- **Answered by how Lite already works.** Page-mode overlays are shown in sandboxed frames layered over the 3D canvas, the
  same way the Play view shows screens: Claude-written HTML never enters the main page. A scene lives inside a project,
  like a canvas, at `#/project/<id>/scene/<sid>`, with Watch, Page and Orbit as modes of that route and a film picker like
  the scenario picker. Mockups of the viewer, the page mode and the landing card are agreed before building (tasks exist).
- **My call: the renderer spike decides.** Three.js is kept unless the spike (CSP, no eval, a lazy chunk of roughly
  600 KB gzipped or less) fails; only then is hand-written WebGL allowed as the fallback, with a smaller feature set.
- **My call: limits and targets.** Up to about 2000 objects after repeaters expand (drawn instanced), 60 fps on a recent
  laptop GPU, calm shadows and fog, nothing drawn while the tab is hidden. Thumbnails are rendered in the browser on first
  view and cached there; nothing binary is stored on the server.
- **My call: review strictness.** Geometry checks use bounding boxes and sampling along the camera path, not exact
  meshes. "Clean" means the same bar as the 2D review: no errors or warnings and a score of at least 90.
- **My call: scroll mapping in Page mode.** A section bound to one shot plays that shot from start to end across its scroll
  range. A section bound to a pair of shots moves from the first shot's start view to the second shot's end view. In the
  gap between sections the camera holds the previous section's end view.

## Left to the builder

- Exact JSON field names and limits, the easing set, and how thumbnails are rendered.
- How scenes are stored, as long as history and the size limit hold.
- The order of the work, though the suggested order is: model and validation, the Watch viewer, review rules, Page mode,
  then the skill and plugin update.
