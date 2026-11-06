---
sidebar_position: 9
slug: /prototype
---

# Prototype: links between screens (spec, not built)

A prototype is the screens of a canvas plus how you move between them. Lite keeps this tiny: Claude writes ordinary HTML and marks links with `data-` attributes, and the canvas names a start screen. Nothing else is stored, and nothing runs inside a screen. The watch page reads the links and plays the move.

## Model

| | Fields |
|---|---|
| canvas (new) | `start_screen` (screen id or none), `transition` (default transition, one of the five below) |
| screen | unchanged: no link fields |

There is **no link table**. The links are the html Claude already sends through `set_screen`, so they cannot drift from what the screen shows, and replacing a screen replaces its links.

- **Start screen.** The screen a prototype opens on. Unset means the first screen in order (the layout order, rowid). If the start screen is removed, `start_screen` is cleared (back to "first screen"), in the same transaction as `remove_screen`.
- **Default transition.** Used by every link without its own `data-transition`. A new canvas starts at `none`.

## Links in the html

Three attributes, on any element (an `<a>` without `href`, a `<button>`, a `<div>`):

| Attribute | Value | Meaning |
|---|---|---|
| `data-to` | a screen id of the same canvas | go to that screen |
| `data-transition` | `none`, `fade`, `slide-left`, `slide-right`, `push` | overrides the canvas default for this link; only read together with `data-to` |
| `data-back` | present (value ignored) | go to the screen the user came from; does nothing at the start of the history |

```html
<button data-to="checkout" data-transition="slide-left">Pay</button>
<a data-back>Back</a>
```

Rules:

- `data-to` wins over `data-back` on the same element. An unknown `data-transition` value falls back to the canvas default.
- A link to a screen id that does not exist is dead: it does nothing, and `set_screen` does not reject it (screens are written in any order). `set_screen` and `set_screens` add a warning for each id that is not a screen of the canvas yet, e.g. `data-to "checkout" is not a screen of this canvas`; warnings never reject, like the existing ones. Ids are checked against the canvas at write time only, so a later `remove_screen` can leave a dead link.
- Only the nearest ancestor-or-self element with `data-to` or `data-back` counts for a click. No `href`, no `onclick`, no `<form>`: the sandbox allows none of them (see [Canvas](canvas.md)).
- The page cannot listen inside a frame. Play (built, see [the watch page](ui.md)) shows screens in `sandbox="allow-same-origin"` frames, reads `[data-to]`, `data-transition` and `data-back` from `frame.contentDocument` and lays a hit area over each element's box in the parent. A link's own valid `data-transition` is used, else the canvas default.

## Transitions

| Value | What happens to the screen area (the frame of the current screen) |
|---|---|
| `none` | the next screen replaces the current one at once |
| `fade` | cross-fade, the old screen fades out as the new one fades in |
| `slide-left` | the new screen enters from the right, the old one leaves to the left |
| `slide-right` | the new screen enters from the left, the old one leaves to the right |
| `push` | the new screen enters from the right and pushes the old one out to the left, both moving together (the old one does not stay still) |

Details to keep it small:

- Duration 220 ms, the same as a fit animation; under `prefers-reduced-motion` every transition is `none`.
- `data-back` plays the **reverse** of the transition the user arrived with (arrived by `slide-left`, back is `slide-right`; `fade` and `none` are their own reverse; `push` goes back as a push in the other direction).
- Screens of different sizes: the stage is the size of the start screen's frame; each screen is drawn at its own size, top-left aligned.
- A transition only shows in play mode (the user is following links); it never changes the canvas, where all screens stay laid out side by side.

## Play and history

The watch page gets a play mode on a canvas: it shows one screen at a time, starting at the start screen, and clicking a link moves. The history is a stack in the browser, never stored and never sent to the Hub; reloading starts again at the start screen. Entering and leaving play mode, and its controls, are described in [the watch page](ui.md). Built details: a slide moves the old screen only a quarter of the width while the new one slides over it (a push moves both the full width), and a fade keeps the old screen opaque underneath so it never dips to the dark stage.

## Tool and events

One new tool, `set_flow` (input `canvas`, `start_screen?`, `transition?`; at least one of the two). It validates that `start_screen` is a screen of the canvas (`unknown screen "<id>"`) and that `transition` is one of the five (`invalid transition: use none, fade, slide-left, slide-right or push`); an omitted field is left as it is, and `start_screen: null` clears it. Answer `{canvas, flow:{start_screen, transition}}`. `read_canvas` and `list_canvases` carry the same `flow` object.

| kind | payload |
|---|---|
| `flow.set` | `{canvas, start_screen, transition}`, the values after the change (start screen `null` when unset), appended in the same transaction, never carries html |
| `screen.set` | unchanged; a changed screen is how a link change reaches the page |

`flow.set` is also appended when `remove_screen` clears the start screen. The page refetches the canvas on `flow.set` like it does for the other canvas events. Storage: two columns on `canvases` (migration 5, see [Database](database.md)).

## Non-goals

Links only. Explicitly out:

- No scripting: no `<script>`, no `onclick`, no event handlers, no expressions or conditions.
- No state: no variables, no "visited" or "logged in", no component states or hover and pressed variants, no history beyond the back stack.
- No forms: inputs render but do nothing, nothing is submitted.
- No per-link behavior beyond target and transition: no delays, timers, overlays or modals, scroll-to or anchors, external URLs, or links between canvases.
- No link editor in the page; the page is read-only and Claude edits the html.
