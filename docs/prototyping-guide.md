---
sidebar_position: 11
slug: /prototyping-guide
---

# Prototyping guide (for Claude)

How to build a clickable prototype in Lite in one pass. Specs: [Prototype](prototype.md), [Prototype tools](prototype-tools.md).

## The loop

1. `open_project` if the project is not there, then `create_canvas`.
2. `set_screens` once with every screen, each with an explicit `id`. Read the warnings.
3. `set_flow` with `start_screen` (and a default `transition`).
4. `validate_flow`. ALWAYS run it after writing screens and fix every warning before showing anything: wire the control (`data-to` or `data-back`), or add `data-inert` when it intentionally goes nowhere. Use `patch_screen` for small fixes and repeat until `ok` and no warnings.
5. `review_prototype`. ALWAYS run it after `validate_flow`: it checks reachability, inbound links, dead ends, nav consistency, a way back, missing states and scenario and tour coverage, and every issue has a `fix`. Keep fixing until `ok` is true and `score` is at least 90.
6. `set_scenarios`: write 2 to 4 scenarios, one per user journey, each step with a caption in plain words. Every step must follow a real link (`data-to` or `data-back`) from the previous step's screen, because the player clicks it. A tour (`set_tour`) is optional.
7. `present` to show it live, `goto` to move, `stop_present` to end. Never present a half-finished prototype.

The process around these steps (brief and journeys first, a screen and state inventory, one shared nav) is the `lite-prototyping` skill, shipped as a Claude Code plugin with a `/prototype` command: see [Plugin](plugin.md).

## Writing screens

- One self-contained HTML document per screen: inline CSS, no scripts, root sized to `width` x `height`. Images only as `https` URLs or `data:` URIs. Put `margin:0` on `body` (the browser's default 8px margin shows the frame's white background as a strip along the top and left edge).
- **Ids are the links.** Give every screen a short slug id (`home`, `detail`, `pay`) and link to it by that id. Name screens for what the user sees ("Home", "Detail"); the id is for you.
- **Links** are attributes on any element: `data-to="<screen id>"`, optional `data-transition="none|fade|slide-left|slide-right|push"`, and `data-back` for a back control. No `href`, `onclick` or `<form>`.
- Make links look clickable (a button, a card, a row) and put `data-to` on the element the user would press. Forward in a flow: `slide-left`. Opening an overlay-like screen: `fade`. Back: `data-back`.
- Every screen should lead somewhere: a link out or a `data-back`. A screen with neither is reported as a dead end.
- Write all screens in one `set_screens` call, so forward links do not warn. After that, change a screen in place with `patch_screen`; do not resend the whole screen to add a link.

## Flow and validation

`set_flow` fixes the start screen and the default transition. `read_flow` shows the whole graph without html (links with `exists`, back controls, tour, scenarios, presenter). `validate_flow` finds `dangling_link` (error), `no_start_screen`, `unreachable`, `bad_transition`, `unlinked_control` (warnings) and `dead_end` (info). A prototype is done when `ok` is true, nothing is unreachable and there is no `unlinked_control` warning.

### Unlinked controls

A control that looks clickable but goes nowhere is the most common flaw. Lite flags every `button`, `a`, `input`, `select`, `summary`, element with `role` button, link, tab or menuitem, element with a `tabindex` (not `-1`) or inline `cursor:pointer` that has no `data-to` or `data-back` (itself or an ancestor). `set_screen`, `set_screens` and `patch_screen` return `N unlinked controls: "Pay", ...` in `warnings`; `validate_flow` returns an `unlinked_control` warning per screen and a `coverage` object `{screens, controls, linked, unlinked, ratio}`. Fix each one by wiring it, or put `data-inert` on the control (or a wrapper) when it is meant to be decoration, e.g. a disabled field. In Play, hold Shift to see the unlinked ones as orange dashed outlines marked `No link`.

## Patching

```json
{ "canvas": "main", "id": "home", "find": "<button>Open</button>", "replace": "<button data-to=\"detail\" data-transition=\"slide-left\">Open</button>" }
```

`find` is plain text and must match exactly once (add surrounding text to make it unique, or set `all`). Several changes: `edits: [{find, replace}, ...]`, applied in order, all or nothing.

## Scenarios

`set_scenarios` stores `[{id, name, description?, steps:[{screen, via?, dwell_ms, caption?}]}]` (at most 12 scenarios, 1 to 40 steps each, `dwell_ms` 200 to 60000, caption at most 200 characters). Write 2 to 4 per prototype, one per user journey ("Place an order", "Something goes wrong"), and narrate each step in plain words ("Maya opens her basket"). Step 0 is the first screen; each later step must be reachable by a link in the previous step's screen, otherwise the call fails and names the scenario, the step and the fix. When two links in a screen go to the same place, add `via` (a part of the link's text). `review_prototype` reports `no_scenarios` (4+ screens) and `scenario_skips_screen`.

## Tours

`set_tour` stores steps `{screen, dwell_ms, note?}` (200 to 60000 ms each, at most 50). Play runs them by itself with the canvas transition and shows `note` as a caption. Keep notes short, one idea per step, 2000 to 4000 ms for a screen with a headline, longer for dense ones.

## Presenting

`present(canvas)` makes every open watch page that follows you open play mode on the start screen at once. `goto(screen, transition?)` moves them (within a second). Narrate in chat between `goto` calls; `stop_present` when done. Viewers can turn Follow off or take over by clicking.

## Worked example: three screens

```json
set_screens {"project":"tvdash","canvas":"main","screens":[
 {"id":"home","name":"Home","width":800,"height":500,"html":"<body style='margin:0;width:800px;height:500px;background:#101418;color:#eee;font:20px sans-serif'><h1 style='padding:32px'>Continue watching</h1><div data-to='player' data-transition='slide-left' style='margin:32px;padding:24px;background:#243;border-radius:12px;width:240px'>Dune, 2h 35m</div></body>"},
 {"id":"player","name":"Player","width":800,"height":500,"html":"<body style='margin:0;width:800px;height:500px;background:#000;color:#fff;font:20px sans-serif'><p style='padding:32px'>Playing: Dune</p><button data-to='done' data-transition='fade' style='margin:32px'>Finish</button><a data-back style='margin:32px'>Back</a></body>"},
 {"id":"done","name":"Done","width":800,"height":500,"html":"<body style='margin:0;width:800px;height:500px;background:#101418;color:#eee;font:20px sans-serif'><h1 style='padding:32px'>Enjoyed it?</h1><a data-to='home' data-transition='push' style='margin:32px'>Back to home</a></body>"}]}
set_flow {"project":"tvdash","canvas":"main","start_screen":"home","transition":"slide-left"}
validate_flow {"project":"tvdash","canvas":"main"}      -> ok, issues []
set_tour {"project":"tvdash","canvas":"main","steps":[
 {"screen":"home","dwell_ms":2500,"note":"Pick something to watch"},
 {"screen":"player","dwell_ms":3000,"note":"The player opens"},
 {"screen":"done","dwell_ms":2500,"note":"A rating prompt, then back home"}]}
present {"project":"tvdash","canvas":"main"}
goto {"project":"tvdash","screen":"player"}
```

Afterwards, to make the Finish button slide instead of fade: `patch_screen` on `player`, find `data-transition='fade'`, replace `data-transition='slide-left'`.
