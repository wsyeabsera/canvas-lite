---
name: lite-scenes
description: Build a finished 3D scene and its films in Lite over MCP. A process, not a tool list - a brief and shot list first, then an object inventory with lighting and sky decided before any data is written, one set_scene pass, then set_films, validated and reviewed in a loop until clean before anything is shown. Use when asked for a 3D scene, a camera flythrough, a product or place visualisation, or a film or page built on a Lite scene.
---

# Lite scenes: a process

Goal: a scene that looks composed, lit and filmed on purpose, never a pile of grey boxes with a camera in the middle. Follow the steps in order. A scene is data, never code: you describe objects, lights, a sky and a camera as JSON. Do not show anything until step 6.

Tool shapes and the worked example: `docs/scenes.md`. Needs the Lite MCP server (`lite` tools).

## The process

1. **Brief and shot list.** Say in two sentences what the film or page is about and who watches it. Then list 3 to 5 shots, each with a plain-words caption of what the viewer sees ("We arrive from the road and see the town square"). The shots decide which objects must exist and where the camera goes.
2. **Object inventory, lighting and sky, before any data.** Write down, in words:
   - One hero object (the thing the first and last shot show) and what makes it stand out.
   - A ground (a plane or terrain), so nothing floats.
   - Depth cues: several things at different distances (a row of trees, a far hill, fog via `sky.fog`).
   - Colours: a small palette with a warm and a cool side. Every object gets its own material colour; the hero is the most saturated.
   - Light: a sun (warm, with a position that gives a clear direction) plus an ambient light (cool, low) for the shadow side. Sky: `top` deeper, `bottom` warmer, never equal.
   Use groups for things with parts (a church = hall, tower, spire) and `repeat` for rows, grids and rings, instead of many hand-placed copies.
3. **One `set_scene` pass** (`open_project` and `create_scene` first if needed): objects, lights, sky and camera in a single call. Slug ids, `#rrggbb` colours, camera outside every object. Then **`set_films`**: 2 to 4 films, 3 to 5 shots each, every shot with a caption in plain words, a real move (`from` differs from `to`, or waypoints), `focus` on the subject, and at least 3 seconds per film (6 to 15 is typical).
4. **Validate, then review, and loop.** Run `validate_scene` and fix every error and warning. Then run `review_scene` and fix every issue that is an error or a warning, plus the info issues that name a real gap (`no_films`, `missing_caption`). Each issue has a `fix` that says what to do; apply it with `patch_scene` (small change) or `set_scene` / `set_films`. Run both again. Stop only when `validate_scene` is ok and `review_scene` is `ok` with `score >= 90`.
5. **Check the story.** Read the captions in order: do they tell the brief? Is every object on the inventory shown by some shot? If not, add a shot or cut the object.
6. **Only then show it:** point the user at the scene's page or film, and say which films and shots it holds. If something cannot be finished, say so and list what is missing instead of showing it.

## Checklist (all must be true before step 6)

- [ ] Brief and a 3 to 5 shot list with captions written first
- [ ] One hero object, a ground, depth cues, a warm and a cool colour
- [ ] A sun and an ambient light, and a sky whose top and bottom differ
- [ ] 2 to 4 films, each with several captioned, moving shots, at least 3 seconds
- [ ] `validate_scene` ok; `review_scene` ok with score >= 90
- [ ] No object that no shot shows

## Anti-patterns

- **Grey boxes**: every object the same default colour, no ground, nothing to tell hero from filler.
- **No lighting**: objects only, or a sun with no ambient light and a flat one-colour sky.
- **A single shot**: one static view is a picture, not a film. A film has an establishing shot, a closer look and a reveal.
- **Camera inside geometry**: a start, end or mid-path position inside a box or a house; add a waypoint around it.
- **"Walkable" promises**: films are camera paths, not a game. Never say the viewer can walk around, collide or interact; say "a guided flythrough".
- **Hand-placing forty copies**: use `repeat`.
- **Presenting early**: showing the scene before `review_scene` is clean "to get feedback". Finish first.
- **Resending the whole scene for a small change**: use `patch_scene`.
