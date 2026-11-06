---
description: Design a complete clickable prototype in Lite (journeys, all screens and states, one nav, validated and reviewed, toured)
argument-hint: <what to design>
---

Design this as a Lite prototype: $ARGUMENTS

Use the `lite-prototyping` skill and run its process in order, without skipping steps:

1. Write a two-sentence product brief and 2-4 user journeys as scenarios.
2. Inventory every screen including states (empty, loading, error, success, confirm) and the navigation model, before writing any html.
3. Write all screens in one `set_screens` pass with the same nav on every app screen; every control wired with `data-to` or `data-back`, or deliberately `data-inert`.
4. `set_flow` with the start screen.
5. `validate_flow`, then `review_prototype`; fix with `patch_screen` or `set_screens` and repeat until validate is ok and review is ok with score >= 90.
6. `set_tour` per journey, covering every screen.
7. Only then `present`. Never present a half-finished prototype.

Finish with the journeys covered, the final review score and the canvas to open.
