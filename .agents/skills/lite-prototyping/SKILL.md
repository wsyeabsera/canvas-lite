---
name: lite-prototyping
description: Build a clickable multi-screen prototype in Lite over MCP (screens with data-to links, a flow, a tour, live presenting). Use when asked to prototype, design a flow, or show screens that link to each other in Lite.
---

# Lite prototyping

Full guide: `docs/prototyping-guide.md`. Tool shapes: `docs/prototype-tools.md`.

The loop:

1. `open_project` (if needed), `create_canvas`.
2. `set_screens` with every screen in one call, each with an explicit slug `id`. One self-contained HTML document per screen: inline CSS, no scripts, root sized to width x height.
3. Links are attributes on any element: `data-to="<screen id>"`, optional `data-transition="none|fade|slide-left|slide-right|push"`, `data-back` for back. No `href`, `onclick` or forms.
4. `set_flow` with `start_screen` and the default `transition`.
5. `validate_flow`; fix errors and warnings with `patch_screen` (plain-text find that matches exactly once, replace) until `ok` and nothing is unreachable. Every screen needs a link out or a `data-back`.
6. Optional: `set_tour` with steps `{screen, dwell_ms (200-60000), note?}`.
7. `present` to show it live, `goto` to move the viewers, `stop_present` when done.

Never resend a whole screen to change one link: use `patch_screen`.
