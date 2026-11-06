---
sidebar_position: 10
slug: /prototype-tools
---

# Prototype tools and live play

How Claude drives the prototype player (see [Prototype](prototype.md) for the link model). Everything here is built; the tools live in `src/flow.ts` and `src/present.ts` (pure, unit tested) with thin Hub and MCP wiring. For how to write a prototype, read the [Prototyping guide](prototyping-guide.md).

> **3D scenes** have their own tools: `create_scene`, `set_scene`, `patch_scene`, `read_scene`, `list_scenes`, `set_films`, `set_page`, `validate_scene` and `review_scene` (a completeness score like `review_prototype`). They follow the same pattern (pure modules, thin wiring, an event per write with no body) but store a scene in a table, not events. See [3D scenes and films](scenes.md).

## Decisions

- **`set_flow` stays as it is.** It already sets the start screen and the default transition; nothing in Proto 2 needs more. Reading is new: `read_flow`.
- **No migration for the tour or the presenter.** Migration 6 belongs to screen versions, and a tour or a presenter session is small, replaceable state that the log already carries. The tour is the latest `tour.set` event of its canvas; the presenter session is the latest `presenter.*` event of its project. Both are read with one indexed query (`events` by project and kind), so a reloaded page and a new tool call see the same state, and there is no column, table or cleanup to keep in step. If a tour ever needs history or sharing across canvases, give it a table then.
- **The session is one per project**, not per canvas: one person is watching one thing.

## Tools

All take `project`; errors are `isError` results with the message shown.

| Tool | Input | Answer |
|---|---|---|
| `set_flow` | `canvas`, `start_screen?` (id or null), `transition?` | `{canvas, flow:{start_screen, transition}}` (unchanged, see Prototype) |
| `read_flow` | `canvas` | `{canvas, start_screen, effective_start, transition, screens:[{id, name, links:[{to, transition, exists}], back}], tour, scenarios, presenter}` |
| `validate_flow` | `canvas` | `{canvas, ok, start_screen, effective_start, issues:[{severity, kind, screen?, to?, message}], coverage:{screens, controls, linked, unlinked, ratio}}` |
| `review_prototype` | `canvas` | `{canvas, score, ok, issues:[{severity, kind, screen?, message, fix}], stats:{screens, links, controls, linked, unlinked, reachable, nav_sets, tour_steps, tour_screens, scenarios, scenario_steps, covered_screens}}` |
| `patch_screen` | `canvas`, `id`, `edits:[{find, replace, all?}]` (1 to 20), or `find`, `replace`, `all?` for one edit | `{screen:{id,name,width,height,x,y,updated_at}, bytes, replaced:[n per edit], warnings}` |
| `set_tour` | `canvas`, `steps:[{screen, dwell_ms, note?}]` (0 to 50) | `{canvas, steps, duration_ms}` |
| `set_scenarios` | `canvas`, `scenarios:[{id, name, description?, steps:[{screen, via?, dwell_ms, caption?}]}]` (0 to 12) | `{canvas, scenarios:[{id, name, steps, duration_ms}], total_ms}` |
| `present` | `canvas`, `screen?` | `{presenter:{active, canvas, screen, transition}}` |
| `goto` | `screen`, `transition?` | `{presenter:{active, canvas, screen, transition}}` |
| `stop_present` | none | `{presenter:{active:false, canvas?}}` |

- `read_flow`: `effective_start` is the screen play opens on (the start screen, else the first, else null). `tour` is `{steps, duration_ms, missing}` or null (`missing` = indexes of steps whose screen was removed). `presenter` is the session when it is on this canvas, else null. No html.
- `validate_flow` kinds: errors `no_screens`, `dangling_link`; warnings `no_start_screen`, `unreachable` (no path from the start through `data-to` links; `data-back` does not count), `bad_transition`, `unlinked_control` (one per screen: `"<id>" has N unlinked controls: "<text>", ... (max 5 samples, +k more): wire each with data-to or data-back, or mark it data-inert`); info `dead_end` (no `data-to` and no `data-back`). `ok` means no errors, so unlinked controls never make it false; ALWAYS run `validate_flow` after writing screens and fix every warning (wire the control, or add `data-inert`) before showing anything. `coverage` counts control-like elements across the canvas: `controls` (not `data-inert`), `linked` (own or ancestor `data-to`/`data-back`), `unlinked`, and `ratio = linked / controls` (2 decimals, 1 when there are none). Issues are ordered errors, warnings, info, then in screen order.
- `patch_screen`: plain text, never a pattern (`$&` in `replace` is literal). Each `find` must occur exactly once unless `all` (then at least once). Edits apply in order, each to the result of the previous. Atomic: any failure writes nothing. Errors: `edit <i>: find not found`, `edit <i>: find found <n> times: add context to make it unique or set all`, `edit <i>: find is empty`, `invalid edits: use 1 to 20 edits per call`, `unknown screen "<id>" on canvas "<canvas>"`, `screen too large: <n> bytes, limit 200000`. The screen keeps its name, size, x, y and place in the order; one `screen.set` event (`created: false`); `warnings` are `set_screen`'s, including dangling links and unlinked controls.
- Unlinked controls (`src/coverage.ts`, pure, no DOM): an element is control-like when it is `button`, `a`, `input` (not `type=hidden`), `select`, `summary`, has `role` button/link/tab/menuitem, a `tabindex` other than `-1`, or an inline `style` with `cursor:pointer`. It is reported unless it or an ancestor has `data-to`, `data-back` or `data-inert` (any value but `false`; inert controls are not counted at all). A control inside an unlinked control is reported once. `set_screen`, `set_screens` and `patch_screen` add one warning per screen, `N unlinked controls: "<text>", ...` (text is the first 40 characters of inner text, else `aria-label`, `value`, `placeholder`, `title`; at most 5 samples then `, +k more`); the scan itself returns at most 20 per screen. Limits: a tag scan with a stack, so html a browser would repair is read leniently; `<script>`/`<style>` bodies are skipped; controls made only by CSS (class-based `cursor`, `:hover`) are invisible to it. Warnings never reject a write.
- `set_scenarios` (`src/scenarios.ts`, pure `checkScenarios`, `validateScenarios`, `stepMove`, `linkControls`): scenarios are named user journeys, stored as the latest `scenarios.set` event of the canvas (no migration, like the tour). Write 2 to 4 per prototype, one per journey, with plain-words captions. Step 0 is the first screen (usually the start, no click). For step n>0 the player moves the cursor in step n-1's screen to the first element whose `data-to` is this step's screen (or a `data-back` element when this step is the screen before the previous one), clicks it, then shows this screen. `via` (at most 60 characters) picks one link by a case-insensitive part of its text when several go to the same target. Limits: 12 scenarios, id a slug, name 80, description 200, 1 to 40 steps, `dwell_ms` 200 to 60000, caption 200. `[]` clears. Errors: `invalid scenarios: use 0 to 12 scenarios`, `invalid scenario <i>: ...`, `invalid scenario "<id>" step <j>: ...`, `scenario "<id>" step <n>: unknown screen "<screen>": ...`, `scenario "<id>" step <n>: no link from "<prev>" to "<screen>": add data-to=... (patch_screen), or use data-back ..., or change the step`, `scenario "<id>" step <n>: via "<via>" matches no link text in "<prev>" ...`. `readScenarios` adds `duration_ms` and `missing` (step indexes whose screen was removed since). The tour stays optional.
- `set_tour`: `dwell_ms` is an integer from 200 to 60000, `note` at most 200 characters (empty is dropped), every screen must exist (`unknown screen "<id>" in step <i>`), `[]` clears the tour. Errors `invalid steps: use 0 to 50 steps`, `invalid step <i>: ...`.
- `present`: opens on `screen`, else the effective start. Replaces an earlier session. Errors `unknown screen`, `canvas "<id>" has no screens to present`.
- `goto`: the transition defaults to the canvas default. Errors `not presenting: call present first`, `unknown screen "<id>" on canvas "<canvas>"`, `invalid transition "<t>": use none, fade, slide-left, slide-right, push`.
- `stop_present`: nothing to stop is not an error and writes no event.

- `review_prototype` (`src/review.ts`, pure `reviewPrototype({screens:[{id,name,html}], start, tour})`) asks whether the canvas is wired like a product, which `validate_flow` does not. Errors: `no_screens`, `dangling_link`. Warnings: `no_start_screen`, `unreachable` (no `data-to` path from the start), `no_inbound_link` (no screen links to it, other than the start), `dead_end` (no link out and no `data-back`), `unlinked_control` (same scan as coverage), `nav_differs` (a set of 3+ `data-to` targets repeated on 2+ screens is a nav bar; a screen that lacks an item of it is reported, a screen's own tab may be absent). Info: `no_way_back` (not the start, no `data-back`, no link towards the start), `missing_state` (4+ screens, none whose id or name matches empty, loading, error, success, offline or confirm), `no_scenarios` (4+ screens and no scenarios), `no_tour` (under 4 screens, no scenarios, no tour), `scenario_skips_screen` (scenarios exist, but no scenario step and no tour step visits the screen), `tour_skips_screen` (only a tour exists). A screen visited by the tour or by any scenario counts as covered. Every issue carries a `fix` text. `score = max(0, 100 - 15 per error - 6 per warning - 1 per info)`; `ok` means no errors and no warnings (info never blocks). Run it after `validate_flow` and keep fixing until `ok` and `score >= 90` before presenting. The Claude Code plugin ([Plugin](plugin.md)) packages this process as a skill and a `/prototype` command.

## Events

Envelope and replay are the usual (see [Progress](progress.md)). None carries html.

| kind | payload | When |
|---|---|---|
| `presenter.started` | `{canvas, screen, transition}` (transition `none`) | `present` |
| `presenter.goto` | `{canvas, screen, transition}` | `goto` |
| `presenter.stopped` | `{canvas}` | `stop_present` when a session was active |
| `scenarios.set` | `{canvas, scenarios:[{id, name, description?, steps:[{screen, via?, dwell_ms, caption?}]}]}` (empty = cleared) | `set_scenarios` |
| `tour.set` | `{canvas, steps:[{screen, dwell_ms, note?}]}` (empty = cleared) | `set_tour` |
| `flow.set` | `{canvas, start_screen, transition}` | `set_flow` (unchanged) |
| `screen.set` | `{canvas, id, name, width, height, bytes, created}` | `patch_screen`, `set_screen(s)` |

## Live play: what the page does

Built in `web/follow.ts` (pure, unit tested in `test/follow.test.ts`), `web/live-view.ts` (DOM) and thin wiring in `web/page.ts`. The page keeps a **Follow** state (default on) per project.

- **Live events only.** A `presenter.started` or `presenter.goto` jumps the page only when it is live: its `ts` is not older than the page load (minus 2 s of clock-skew slack). Events replayed by the websocket backfill still fold into the session state (so the pill is right) but never move the viewer. The page follows only events of the project it is showing.
- **Follow on:** open Play on `payload.canvas` if it is not open (navigates to `#/project/<id>/canvas/<canvas>/play/<screen>`), then jump to `payload.screen` with `payload.transition`. A goto for a screen the page does not have yet is held and retried after the next refetch. A new `presenter.started` turns Follow back on.
- **The pill.** While a session is active on this canvas and Follow is on, a glass pill at the top centre of the play stage replaces the normal bar: green live dot, "Claude is presenting", `<screen name>, step n of m`, progress dots and a **Take over** button. `n` and `m` come from the canvas tour when the screen is in it, else from the screens visited this session out of the canvas's screens; dots are hidden above 12.
- **Take over.** The Take over button, or the viewer following a link, pressing Back or Restart (mouse or key) in the stage, stops following. Claude's session is untouched; the normal bar returns with a small **Follow** button that follows again and jumps to where Claude is now.
- **`presenter.stopped`:** the pill (or Follow button) goes; Play stays open on the screen the viewer is on.
- **On load or reconnect:** `GET /api/projects/<id>/canvases/<canvas>` also returns `tour` (`{steps, duration_ms, missing}` or null), `scenarios` (`[{id, name, description?, steps, duration_ms, missing}]`, `[]` when none; same as `read_flow`) and `presenter` (the project's session or null). On the first load of a canvas, an active session on it with Follow on opens Play on its screen (not when the URL deep-links a screen, or Play is on another screen).
- **Tour play.** When the canvas has a tour, the Play bar gets a **Tour** button (not shown under the live pill). It runs a client timer (100 ms ticks) over `tour.steps`: each step is entered with `goto` and the canvas default transition and stays for `dwell_ms`; the step's `note` shows as a caption chip under the stage. The button reads `Pause · 2/5` while playing and `Resume · 2/5` while paused; after the last step the run stops on it and the button reads `Tour` again (a click restarts from the top). Any viewer link, Back or Restart pauses the tour. A new `tour.set` refetches the canvas and stops a running tour. Leaving Play or changing canvas stops it.

- **Walkthrough.** The same tour also drives the **Walkthrough** mode of Play (`#/project/<id>/canvas/<cid>/walk`, key `W`; see [the watch page](ui.md#walkthrough)): its steps are the tour's steps and each `note` becomes a callout next to the first link of that screen. With no tour the steps are derived from the links. A Follow jump to a screen that is a step moves the walkthrough to it; the viewer's Auto-advance state is not touched.

The pure pieces: `onPresenterEvent(state, event, loadedAt)` folds a `presenter.*` event and returns the jump (if any); `onCanvasLoad`, `takeOver`, `resumeFollow`, `pillModel`, and for the tour `tourStart`, `tourTick(run, dt)` (returns the step to enter), `tourPause`, `tourResume`, `tourCaption`, `tourLabel`, `tourPosition(steps, t)`. The page keeps its own small copy of the presenter fold and `tourPosition` because `src/present.ts` and `src/flow.ts` import the Worker store; `test/follow.test.ts` checks both copies give the same answers.

## Limits

Patch edits per call 20; tour steps 50; `dwell_ms` 200 to 60000; note 200 characters; the screen limits of [Canvas](canvas.md) apply to a patched screen.
