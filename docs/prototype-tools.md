---
sidebar_position: 10
slug: /prototype-tools
---

# Prototype tools and live play

How Claude drives the prototype player (see [Prototype](prototype.md) for the link model). Everything here is built; the tools live in `src/flow.ts` and `src/present.ts` (pure, unit tested) with thin Hub and MCP wiring. For how to write a prototype, read the [Prototyping guide](prototyping-guide.md).

## Decisions

- **`set_flow` stays as it is.** It already sets the start screen and the default transition; nothing in Proto 2 needs more. Reading is new: `read_flow`.
- **No migration for the tour or the presenter.** Migration 6 belongs to screen versions, and a tour or a presenter session is small, replaceable state that the log already carries. The tour is the latest `tour.set` event of its canvas; the presenter session is the latest `presenter.*` event of its project. Both are read with one indexed query (`events` by project and kind), so a reloaded page and a new tool call see the same state, and there is no column, table or cleanup to keep in step. If a tour ever needs history or sharing across canvases, give it a table then.
- **The session is one per project**, not per canvas: one person is watching one thing.

## Tools

All take `project`; errors are `isError` results with the message shown.

| Tool | Input | Answer |
|---|---|---|
| `set_flow` | `canvas`, `start_screen?` (id or null), `transition?` | `{canvas, flow:{start_screen, transition}}` (unchanged, see Prototype) |
| `read_flow` | `canvas` | `{canvas, start_screen, effective_start, transition, screens:[{id, name, links:[{to, transition, exists}], back}], tour, presenter}` |
| `validate_flow` | `canvas` | `{canvas, ok, start_screen, effective_start, issues:[{severity, kind, screen?, to?, message}]}` |
| `patch_screen` | `canvas`, `id`, `edits:[{find, replace, all?}]` (1 to 20), or `find`, `replace`, `all?` for one edit | `{screen:{id,name,width,height,x,y,updated_at}, bytes, replaced:[n per edit], warnings}` |
| `set_tour` | `canvas`, `steps:[{screen, dwell_ms, note?}]` (0 to 50) | `{canvas, steps, duration_ms}` |
| `present` | `canvas`, `screen?` | `{presenter:{active, canvas, screen, transition}}` |
| `goto` | `screen`, `transition?` | `{presenter:{active, canvas, screen, transition}}` |
| `stop_present` | none | `{presenter:{active:false, canvas?}}` |

- `read_flow`: `effective_start` is the screen play opens on (the start screen, else the first, else null). `tour` is `{steps, duration_ms, missing}` or null (`missing` = indexes of steps whose screen was removed). `presenter` is the session when it is on this canvas, else null. No html.
- `validate_flow` kinds: errors `no_screens`, `dangling_link`; warnings `no_start_screen`, `unreachable` (no path from the start through `data-to` links; `data-back` does not count), `bad_transition`; info `dead_end` (no `data-to` and no `data-back`). `ok` means no errors. Issues are ordered errors, warnings, info, then in screen order.
- `patch_screen`: plain text, never a pattern (`$&` in `replace` is literal). Each `find` must occur exactly once unless `all` (then at least once). Edits apply in order, each to the result of the previous. Atomic: any failure writes nothing. Errors: `edit <i>: find not found`, `edit <i>: find found <n> times: add context to make it unique or set all`, `edit <i>: find is empty`, `invalid edits: use 1 to 20 edits per call`, `unknown screen "<id>" on canvas "<canvas>"`, `screen too large: <n> bytes, limit 200000`. The screen keeps its name, size, x, y and place in the order; one `screen.set` event (`created: false`); `warnings` are `set_screen`'s, including dangling links.
- `set_tour`: `dwell_ms` is an integer from 200 to 60000, `note` at most 200 characters (empty is dropped), every screen must exist (`unknown screen "<id>" in step <i>`), `[]` clears the tour. Errors `invalid steps: use 0 to 50 steps`, `invalid step <i>: ...`.
- `present`: opens on `screen`, else the effective start. Replaces an earlier session. Errors `unknown screen`, `canvas "<id>" has no screens to present`.
- `goto`: the transition defaults to the canvas default. Errors `not presenting: call present first`, `unknown screen "<id>" on canvas "<canvas>"`, `invalid transition "<t>": use none, fade, slide-left, slide-right, push`.
- `stop_present`: nothing to stop is not an error and writes no event.

## Events

Envelope and replay are the usual (see [Progress](progress.md)). None carries html.

| kind | payload | When |
|---|---|---|
| `presenter.started` | `{canvas, screen, transition}` (transition `none`) | `present` |
| `presenter.goto` | `{canvas, screen, transition}` | `goto` |
| `presenter.stopped` | `{canvas}` | `stop_present` when a session was active |
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
- **On load or reconnect:** `GET /api/projects/<id>/canvases/<canvas>` also returns `tour` (`{steps, duration_ms, missing}` or null) and `presenter` (the project's session or null). On the first load of a canvas, an active session on it with Follow on opens Play on its screen (not when the URL deep-links a screen, or Play is on another screen).
- **Tour play.** When the canvas has a tour, the Play bar gets a **Tour** button (not shown under the live pill). It runs a client timer (100 ms ticks) over `tour.steps`: each step is entered with `goto` and the canvas default transition and stays for `dwell_ms`; the step's `note` shows as a caption chip under the stage. The button reads `Pause · 2/5` while playing and `Resume · 2/5` while paused; after the last step the run stops on it and the button reads `Tour` again (a click restarts from the top). Any viewer link, Back or Restart pauses the tour. A new `tour.set` refetches the canvas and stops a running tour. Leaving Play or changing canvas stops it.

The pure pieces: `onPresenterEvent(state, event, loadedAt)` folds a `presenter.*` event and returns the jump (if any); `onCanvasLoad`, `takeOver`, `resumeFollow`, `pillModel`, and for the tour `tourStart`, `tourTick(run, dt)` (returns the step to enter), `tourPause`, `tourResume`, `tourCaption`, `tourLabel`, `tourPosition(steps, t)`. The page keeps its own small copy of the presenter fold and `tourPosition` because `src/present.ts` and `src/flow.ts` import the Worker store; `test/follow.test.ts` checks both copies give the same answers.

## Limits

Patch edits per call 20; tour steps 50; `dwell_ms` 200 to 60000; note 200 characters; the screen limits of [Canvas](canvas.md) apply to a patched screen.
