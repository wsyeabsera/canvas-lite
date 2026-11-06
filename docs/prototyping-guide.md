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
4. `validate_flow`. Fix errors and warnings (use `patch_screen` for small fixes), repeat until `ok` and no warnings.
5. Optional: `set_tour` for a walkthrough that plays by itself.
6. `present` to show it live, `goto` to move, `stop_present` to end.

## Writing screens

- One self-contained HTML document per screen: inline CSS, no scripts, root sized to `width` x `height`. Images only as `https` URLs or `data:` URIs. Put `margin:0` on `body` (the browser's default 8px margin shows the frame's white background as a strip along the top and left edge).
- **Ids are the links.** Give every screen a short slug id (`home`, `detail`, `pay`) and link to it by that id. Name screens for what the user sees ("Home", "Detail"); the id is for you.
- **Links** are attributes on any element: `data-to="<screen id>"`, optional `data-transition="none|fade|slide-left|slide-right|push"`, and `data-back` for a back control. No `href`, `onclick` or `<form>`.
- Make links look clickable (a button, a card, a row) and put `data-to` on the element the user would press. Forward in a flow: `slide-left`. Opening an overlay-like screen: `fade`. Back: `data-back`.
- Every screen should lead somewhere: a link out or a `data-back`. A screen with neither is reported as a dead end.
- Write all screens in one `set_screens` call, so forward links do not warn. After that, change a screen in place with `patch_screen`; do not resend the whole screen to add a link.

## Flow and validation

`set_flow` fixes the start screen and the default transition. `read_flow` shows the whole graph without html (links with `exists`, back controls, tour, presenter). `validate_flow` finds `dangling_link` (error), `no_start_screen`, `unreachable`, `bad_transition` (warnings) and `dead_end` (info). A prototype is done when `ok` is true and nothing is unreachable.

## Patching

```json
{ "canvas": "main", "id": "home", "find": "<button>Open</button>", "replace": "<button data-to=\"detail\" data-transition=\"slide-left\">Open</button>" }
```

`find` is plain text and must match exactly once (add surrounding text to make it unique, or set `all`). Several changes: `edits: [{find, replace}, ...]`, applied in order, all or nothing.

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
