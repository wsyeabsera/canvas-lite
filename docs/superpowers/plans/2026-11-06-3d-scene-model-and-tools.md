# 3D scene model and tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude can create, edit, read and validate 3D scenes and their films (shot lists) through the MCP, with no viewer yet.

**Architecture:** Pure modules (`src/scene.ts`, `src/shots.ts`, `src/scene-validate.ts`) hold the data model and all checks. A new `scenes` table (migration 7) stores the scene and its films as JSON; events (`scene.set`, `films.set`, `scene.removed`) carry no body. `src/scene-store.ts` is the only code that touches the table; the Hub and MCP files only wire it, following `src/scenarios.ts`.

**Tech Stack:** TypeScript, node:test, the existing Sql wrapper (`test/node-sql.ts` in-memory db), zod in `src/mcp.ts`.

**Spec:** `docs/superpowers/specs/2026-11-06-3d-scenes-design.md`. This is plan 1 of 4 (model and tools). Plans for the viewer, Page mode, and review plus skill come after the renderer spike (#2008) and the mockups (#2007).

## Global Constraints

- Unit tests only (node:test) in `test/`; never add Playwright or e2e. Unit tests use their own in-memory db (`test/node-sql.ts`).
- `npm run check` passes after every task. Never delete a test.
- Docs change in the same commit as code; when `docs/` changes, `cd site && npm run build` passes (`npm ci` in `site/` first if needed).
- Scenes are data only: no Claude-written code runs anywhere. No game logic, physics or external models/textures in this version.
- Limits: at most 2000 objects after repeaters expand; scene JSON at most 200,000 bytes; nesting depth at most 6; ids are slugs `[a-z0-9-]` up to 40 characters; names up to 80; captions up to 200; shot duration 500 to 60000 ms.
- Desktop only; no Shaders account.
- Migrations only append (`migrate()` in `src/store.ts`); existing data is untouched.

## Review Focus

- A scene with zero objects: valid (a sky and lights alone), and `validate_scene` says so as an info note, never an error.
- A repeater whose count would exceed the limit after expansion: rejected with the object id and the expanded count named, before anything is stored.
- Non-finite or absurd numbers (NaN, Infinity, 1e12) anywhere in positions, sizes, intensities: rejected with the path of the bad value.
- `patch_scene` removes or renames an object a film's shot still points at: the patch succeeds, `read_scene` lists the shot under `missing`, and nothing throws.
- Duplicate ids across nested groups, and a deleted project or scene: a clear error naming the id, never a crash.

---

### Task 1: Scene data model and validation

**Files:**
- Create: `src/scene.ts`, `test/scene.test.ts`

**Interfaces:**
- Produces:
  - Types: `Vec3 = [number, number, number]`; `Material = {color: string; roughness?: number; metalness?: number; emissive?: string; opacity?: number}` (colours `#rrggbb`, numbers 0 to 1); `SceneObject = {id: string; kind: "box"|"sphere"|"cylinder"|"cone"|"plane"|"torus"|"capsule"|"text"|"group"|"repeat"|"terrain"; name?: string; pos?: Vec3; rot?: Vec3 (degrees); scale?: Vec3; size?: number[]; material?: Material; text?: string; children?: SceneObject[]; repeat?: {mode: "grid"|"ring"|"scatter"; count: number; spacing?: number; radius?: number; seed?: number; of: SceneObject}; terrain?: {size: [number, number]; height: number; scale: number; octaves: number; seed: number}}`; `Light = {id: string; kind: "sun"|"ambient"|"point"|"spot"; color: string; intensity: number; pos?: Vec3; target?: Vec3}`; `Sky = {top: string; bottom: string; fog?: {color: string; near: number; far: number}}`; `View = {pos: Vec3; look: Vec3 | string}` (a string is an object id); `Scene = {name: string; objects: SceneObject[]; lights: Light[]; sky: Sky; camera: View & {fov: number}}`.
  - Constants: `SCENE_OBJECTS_MAX = 2000`, `SCENE_BYTES_MAX = 200_000`, `SCENE_NESTING_MAX = 6`, `SCENE_NAME_MAX = 80`.
  - `checkScene(input: unknown): Scene` throws `Error` with a message naming the path (`objects[3].material.color`).
  - `expandObjects(objects: SceneObject[]): SceneObject[]` returns the flattened drawable list with repeaters expanded (grid, ring, scatter with a seeded generator) and group transforms left to the renderer; ids of expanded copies are `<id>#<n>`.
  - `objectIds(scene: Scene): Set<string>` lists every declared id (not the expanded copies).
- Consumes: nothing.

- [ ] **Step 1: Write the failing tests** in `test/scene.test.ts`: `checkScene accepts a minimal scene (no objects)`; `checkScene names the path of a bad colour` (`objects[0].material.color` for `"red"`); `checkScene rejects NaN, Infinity and 1e12 positions` naming `objects[0].pos[1]`; `checkScene rejects duplicate ids across nested groups` naming the id; `checkScene rejects nesting deeper than 6`; `checkScene rejects over 200000 bytes`; `expandObjects grid of 3 x 3 gives 9 copies with ids tower#0..tower#8`; `expandObjects scatter is deterministic for a seed`; `a repeater expanding past 2000 objects is rejected, naming the id and the expanded count`.
- [ ] **Step 2: Run** `npm test -- scene` and expect FAIL (module not found).
- [ ] **Step 3: Implement** `checkScene`, `expandObjects`, `objectIds` in `src/scene.ts`. Seeded scatter uses a small integer hash (mulberry32), not `Math.random`. `checkScene` calls `expandObjects` to enforce the 2000 limit.
- [ ] **Step 4: Run** `npm test -- scene` and expect PASS; run `npm run check`.
- [ ] **Step 5: Commit** `git add src/scene.ts test/scene.test.ts && git commit -m "Scene model: schema, validation, repeaters (3D plan task 1)"`.

### Task 2: Shots and films

**Files:**
- Create: `src/shots.ts`, `test/shots.test.ts`

**Interfaces:**
- Consumes: `Scene`, `View`, `Vec3`, `objectIds` from Task 1.
- Produces:
  - Types: `Shot = {id: string; name: string; from: View; to: View; waypoints?: Vec3[] (at most 8); duration_ms: number; ease?: "linear"|"in-out"|"out"; caption?: string; focus?: string}`; `Film = {id: string; name: string; description?: string; shots: Shot[]}`; `FilmRead = Film & {duration_ms: number; missing: number[]}` (`missing` = shot indexes whose `focus` or look-at object id no longer exists).
  - Constants: `FILMS_MAX = 8`, `SHOTS_MAX = 30`, `SHOT_MS_MIN = 500`, `SHOT_MS_MAX = 60_000`.
  - `checkFilms(input: unknown, scene: Scene): Film[]` throws naming `film "<id>" shot <n>` for unknown `focus` or look-at object ids, a duration outside 500 to 60000, a missing id or name, more than 8 waypoints, and over the film or shot counts.
  - `filmDuration(shots: Shot[]): number` sums the durations.
  - `readFilms(films: Film[], scene: Scene): FilmRead[]`.
- [ ] **Step 1: Write the failing tests** in `test/shots.test.ts`: `checkFilms accepts a 2-shot film`; `checkFilms names film and shot for an unknown focus object`; `checkFilms rejects 499 ms and 60001 ms`; `checkFilms rejects 9 waypoints`; `checkFilms rejects 9 films`; `filmDuration sums`; `readFilms lists a shot under missing when its focus object is gone`.
- [ ] **Step 2: Run** `npm test -- shots`, expect FAIL.
- [ ] **Step 3: Implement** the four functions in `src/shots.ts`, reusing `checkId`-style slug validation from `src/canvases.ts`.
- [ ] **Step 4: Run** `npm test -- shots` and `npm run check`, expect PASS.
- [ ] **Step 5: Commit** `git add src/shots.ts test/shots.test.ts && git commit -m "Films and shots: model and validation (3D plan task 2)"`.

### Task 3: validate_scene checks

**Files:**
- Create: `src/scene-validate.ts`, `test/scene-validate.test.ts`

**Interfaces:**
- Consumes: `Scene`, `expandObjects`, `Film`, `Shot` from Tasks 1 and 2.
- Produces: `validateScene(scene: Scene, films: Film[]): {ok: boolean; issues: {severity: "error"|"warning"|"info"; kind: string; message: string; fix: string; object?: string; film?: string; shot?: number}[]}`. Issue kinds: `camera_inside_solid` (error; a shot's `from` or `to` position inside an object's axis-aligned bounding box, boxes approximated from `size`, `scale` and `pos`, ignoring rotation), `empty_scene` (info), `no_lights` (warning), `shot_looks_at_nothing` (error; `look` is an object id that does not exist), `film_too_short` (warning; under 3000 ms total). `ok` means no errors.
- [ ] **Step 1: Write the failing tests**: `camera inside a box is an error naming the shot`; `a camera just outside the box is fine`; `empty scene is info, not error`; `no lights is a warning`; `film under 3 s is a warning`; `ok is true with warnings only`.
- [ ] **Step 2: Run** `npm test -- scene-validate`, expect FAIL.
- [ ] **Step 3: Implement** `validateScene`; the bounding-box test works on `expandObjects` output with group offsets applied by summing `pos`.
- [ ] **Step 4: Run** `npm test -- scene-validate` and `npm run check`, expect PASS.
- [ ] **Step 5: Commit** `git add src/scene-validate.ts test/scene-validate.test.ts && git commit -m "validate_scene checks (3D plan task 3)"`.

### Task 4: Storage (migration 7) and scene store

**Files:**
- Modify: `src/store.ts` (append migration 7), `test/store.test.ts` (expected migration list `[1..7]`)
- Create: `src/scene-store.ts`, `test/scene-store.test.ts`

**Interfaces:**
- Consumes: `checkScene`, `Scene` (Task 1); `checkFilms`, `readFilms`, `Film`, `FilmRead` (Task 2); `requireProject`, `checkId` and `appendEvent`, `Sql` as used by `src/scenarios.ts`.
- Produces:
  - Table `scenes(project TEXT, id TEXT, name TEXT, data TEXT, films TEXT NOT NULL DEFAULT '[]', updated_at INTEGER, removed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (project, id))`.
  - `createScene(sql, project, {id?, name}, now?): {scene: SceneSummary; event}`; `setScene(sql, project, id, input, now?)` replaces the scene after `checkScene` and appends `scene.set {scene: id, name, bytes}`; `patchScene(sql, project, id, edits: {op: "set"|"remove"; id: string; object?: SceneObject}[], now?)` edits top-level or nested objects by id, re-checks the whole scene, and appends `scene.set`; `setFilms(sql, project, id, films: unknown, now?)` appends `films.set {scene: id, count}`; `readScene(sql, project, id): {scene: Scene; films: FilmRead[]; updated_at: number}`; `listScenes(sql, project): SceneSummary[]` where `SceneSummary = {id: string; name: string; objects: number; films: number; updated_at: number}`.
  - Errors reuse the existing `unknown project` text and add `unknown scene "<id>"`.
- [ ] **Step 1: Write the failing tests**: `migration 7 on a populated v6 database keeps all data and adds the scenes table`; `createScene then readScene round-trips`; `setScene stores the body in the table and the event carries no body (no object data in the event payload)`; `patchScene removes an object a shot points at, succeeds, and readScene lists the shot under missing`; `patchScene with an unknown object id names it`; `setFilms rejects a shot whose focus object does not exist`; `listScenes counts objects and films`.
- [ ] **Step 2: Run** `npm test -- scene-store store`, expect FAIL.
- [ ] **Step 3: Implement** migration 7 and the functions. `patchScene` walks `children` and `repeat.of` to find ids and writes the whole checked scene back in one transaction.
- [ ] **Step 4: Run** `npm test -- scene-store store` and `npm run check`, expect PASS.
- [ ] **Step 5: Commit** `git add src/store.ts src/scene-store.ts test/store.test.ts test/scene-store.test.ts && git commit -m "Scenes table (migration 7) and scene store (3D plan task 4)"`.

### Task 5: Hub, MCP tools and page API

**Files:**
- Modify: `src/hub.ts`, `src/mcp.ts`, `src/api.ts`, `src/index.ts`
- Test: `test/scene-tools.test.ts`, `test/api.test.ts` (route parsing cases added)

**Interfaces:**
- Consumes: everything produced by Tasks 1 to 4.
- Produces: MCP tools `create_scene {project, name, id?}`, `set_scene {project, scene, data}`, `patch_scene {project, scene, edits}`, `read_scene {project, scene}`, `list_scenes {project}`, `set_films {project, scene, films}`, `validate_scene {project, scene}`; Hub methods with the same names that call the store, broadcast the returned event, and follow the `setScenarios` wiring in `src/hub.ts`; page API `GET /api/projects/<id>/scenes` (the list) and `GET /api/projects/<id>/scenes/<sid>` (read_scene's answer), same token gate and 404/400 rules as the canvas routes. Tool descriptions tell Claude: a scene is data, build lights and a sky, write 2 to 4 films with captions in plain words, run `validate_scene` and fix every issue before showing anything.
- [ ] **Step 1: Write the failing tests** in `test/scene-tools.test.ts` (hub-less, like `test/proto-tools.test.ts`): create, set, patch, set_films, read and validate end to end on an in-memory db; the answer of `validate_scene` for a camera inside a box; and in `test/api.test.ts` that `/api/projects/p/scenes` and `/scenes/s` parse and a bad scene id is 400.
- [ ] **Step 2: Run** `npm test -- scene-tools api`, expect FAIL.
- [ ] **Step 3: Implement** the wiring: zod schemas in `src/mcp.ts` accept `data`/`films`/`edits` as loose JSON and leave validation to the pure modules; `src/api.ts` gets two route kinds.
- [ ] **Step 4: Run** `npm test -- scene-tools api` and `npm run check`, expect PASS.
- [ ] **Step 5: Commit** `git add src test && git commit -m "Scene tools and page API (3D plan task 5)"`.

### Task 6: Docs

**Files:**
- Create: `docs/scenes.md` (scene, shot and film JSON with one worked example of a 3-shot film over a small town; limits; events; storage)
- Modify: `docs/database.md` (migration 7), `docs/api.md` (the two routes), `docs/prototype-tools.md` (a pointer to the scene tools), `docs/index.md` (link `docs/scenes.md`)

**Interfaces:**
- Consumes: the shapes and limits from Tasks 1 to 5. Produces: the written contract the viewer plans build on.

- [ ] **Step 1: Write** the pages. The worked example in `docs/scenes.md` must be valid input: add `test/scenes-doc.test.ts` that extracts its JSON blocks and runs them through `checkScene` and `checkFilms`.
- [ ] **Step 2: Run** `npm test -- scenes-doc` (expect PASS once the pages exist), then `npm run check` and `cd site && npm run build` (expect "Generated static files").
- [ ] **Step 3: Commit** `git add docs test && git commit -m "Scene docs (3D plan task 6)"`.

---

## Self-review

- **Spec coverage:** scene data, repeaters, terrain, lights, sky, materials and the default camera (Task 1); shots and films with waypoints, easing, captions and focus (Task 2); `validate_scene` (Task 3); storage, `patch_scene` and size limits (Task 4); tools and the page API (Task 5); docs (Task 6). Deferred to later plans on purpose: the viewer, Watch and Orbit, `set_page` and Page mode, `review_scene`, the skill and plugin, landing cards, thumbnails. Terrain and text objects are validated here and drawn by the viewer plan.
- **Type consistency:** `Scene`, `View`, `Film`, `Shot` and `FilmRead` are defined once (Tasks 1 and 2) and used by name afterwards; `SceneSummary` is defined in Task 4 and used in Task 5.
- **Proportion:** one short plan for the first of four subsystems; code is given only as signatures and test names.
