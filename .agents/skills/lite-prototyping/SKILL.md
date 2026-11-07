---
name: lite-prototyping
description: Design a complete, product-wired clickable prototype in Lite over MCP. A process, not a tool list - brief and user journeys first, then every screen including states (empty, loading, error, success, confirm) and one navigation model, built in one pass, validated, reviewed and played as scenarios before anything is shown. Use when asked to prototype, design a flow, mock up an app, or show linked screens in Lite.
---

# Lite prototyping: a process

Goal: a prototype that is wired like a real product, never a pile of pictures. Follow the steps in order. Do not skip ahead, and do not show anything until step 7.

Tool shapes: `docs/prototype-tools.md`. Writing rules: `docs/prototyping-guide.md`. Needs the Lite MCP server (`lite` tools).

## The process

1. **Brief and journeys.** State the product in two sentences: who uses it, for what. Write 2-4 user journeys as scenarios, each a goal and the steps to reach it ("Maya pays an invoice: Home, Invoices, Invoice detail, Pay, Confirm, Success"). Journeys decide which screens exist.
2. **Inventory before html.** List every screen, including the states a real product has: empty, loading, error, success, confirm (and offline when it matters). Give each a slug id (`invoice-empty`, `pay-error`). Then write the navigation model: which nav or tab items exist, the order, and where each one goes. A screen that is not on a journey or in the nav does not exist yet: add it to one or drop it.
3. **Build every screen in ONE `set_screens` pass** (`open_project` and `create_canvas` first if needed; call `get_design_system` first and, when the project has one, use only its colors, fonts and font sizes, since `review_prototype` warns about anything else). One self-contained HTML document per screen: inline CSS, no scripts, `margin:0` on body, root sized to width x height. Every screen that belongs to the app shows the same nav bar (same items, same order, same targets). Every control is wired: `data-to="<screen id>"` (optional `data-transition`), `data-back` for back and cancel, or `data-inert` when it deliberately goes nowhere (a disabled field, decoration). No `href`, `onclick` or forms. Real copy and plausible data, never "Lorem ipsum" or "Screen 2".
4. **`set_flow`** with `start_screen` (where a user lands first) and the default transition.
5. **Validate, then review, and loop.** Run `validate_flow`, fix every error and warning. Then run `review_prototype` and fix every issue whose severity is error or warning, plus the info issues that name a real gap (missing state, screen no journey visits, no way back). Each issue has a `fix` that says what to do; apply it with `patch_screen` (small change) or `set_screens` (several screens). Run both again. Stop only when `validate_flow` is ok, and `review_prototype` is `ok` with `score >= 90`.
6. **Write scenarios with `set_scenarios`.** 2 to 4 scenarios, one per journey from step 1. One step per screen the journey visits; step 0 is the first screen, and every later step must follow a real link (`data-to`, or `data-back` to return) from the previous step's screen, because the player clicks it (add `via`, a part of the link's text, when several links go to the same screen). Give every step a `caption` that narrates in plain words what the user does and sees. Make sure every screen is visited by some scenario. `set_tour` is optional. Run `review_prototype` once more.
7. **Only then show it:** `present` (and `goto`) or point the user at the canvas. Say which journeys it covers. Never present a half-finished prototype; if something cannot be finished, say so and list what is missing instead of showing it.

## Checklist (all must be true before step 7)

- [ ] Product brief and 2-4 journeys written down first
- [ ] Every screen, including empty, loading, error, success, confirm states, exists
- [ ] One shared nav bar on every app screen, every item leads to a real screen
- [ ] Every control has `data-to`, `data-back` or an intentional `data-inert`
- [ ] Every screen is reachable from the start, has a way out and a way back
- [ ] The project's design system (`get_design_system`) was read first and followed
- [ ] `validate_flow` ok; `review_prototype` ok with score >= 90
- [ ] A scenario for each journey (`set_scenarios`, captioned in plain words), covering every screen
- [ ] Copy and data look real

## Anti-patterns

- **Placeholder screens**: "Coming soon", "Screen 3", empty boxes. Build it or cut the link to it.
- **Decorative nav**: a tab bar whose items are not links, or that differs from screen to screen.
- **Dead-end screens**: no `data-to` and no `data-back`; the viewer is stuck.
- **One-screen "flows"**: a single page with buttons that go nowhere. A flow has a start, a middle and an outcome.
- **Happy path only**: no empty, error or confirm state anywhere.
- **Presenting early**: showing the canvas before `review_prototype` is clean "to get feedback". Finish first.
- **Resending whole screens to add a link**: use `patch_screen`.
- **Silencing instead of wiring**: `data-inert` on a control that a user would obviously press.
