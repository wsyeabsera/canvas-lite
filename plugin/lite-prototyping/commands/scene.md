---
description: Build a finished 3D scene with films in Lite (brief, shot list, lighting and sky, validated and reviewed)
argument-hint: <what to build>
---

Build this as a Lite 3D scene: $ARGUMENTS

Use the `lite-scenes` skill and run its process in order, without skipping steps:

1. Write a two-sentence brief and a 3-5 shot list with plain-words captions.
2. Decide the object inventory, lighting and sky before writing any data: one hero object, a ground, depth cues, a warm and a cool colour, a sun plus an ambient light, a sky whose top and bottom differ.
3. One `set_scene` pass, then `set_films` with 2-4 captioned, moving films.
4. `validate_scene`, then `review_scene`; fix with `patch_scene`, `set_scene` or `set_films` and repeat until validate is ok and review is ok with score >= 90.
5. Only then show it. Never present a half-finished scene, and never promise the viewer can walk around.

Finish with the films and shots it holds and the final review score.
