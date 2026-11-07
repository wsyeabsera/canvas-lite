---
sidebar_position: 14
slug: /variants
---

# Variants, blind walks and tournaments

Claude can try a design several ways at once and let **blind synthetic users** test each way, so you choose with evidence instead of from a description. Three pieces build on each other: **variants** (branches of a canvas), **walks** (one blind user, one goal) and **tournaments** (the same goals on every variant, scored).

The users are fresh Claude subagents. Lite has no model of its own and never calls one: it only shows a user what a user may see, records the walk, and scores it with plain code. The results are a signal, not proof. Check the winner with real people.

## Variants

A variant is an ordinary canvas that also remembers `forked_from {canvas, seq}`. Forking copies the canvas as it was at change `seq` (default now): every screen, its start screen and transition, written as normal events (`screen.set`, `flow.set`, then one `canvas.forked`), so a variant replays and exports like any canvas. The base never changes until a merge. A fork counts toward the 20 canvases per project.

| Tool | Does |
|---|---|
| `fork_canvas(project, canvas, name, id?, seq?)` | New variant. The id defaults to the slug of canvas and name; an existing id is an error. |
| `list_variants(project, canvas)` | `{base, variants: [{id, name, screens, updated_at, forked_from}], tournament}`; give the base or any variant (a variant of a variant resolves to the first base); `tournament` is the newest tournament id on the base. |
| `merge_variant(project, variant)` | Makes the base look exactly like the variant: its screens (screens it lacks are removed), start screen and transition, as normal changes, so history stays one line. First the base is kept whole as a new variant `<base>-old` (`-old-2` and so on), so nothing is lost. The variant stays. Ends with `flow.set` and `variant.merged`. |

Only the owner chooses: Claude never merges until told which variant to keep.

## Walks

A walk is one synthetic user, one goal, one canvas. `walk_start(project, canvas, goal, target)` (or `tournament` and `goal_index`) puts the user on the canvas's start screen; `walk_step(project, walk, choice | give_up, note?)` follows a link. The user sees **only** the visible text of the screen (scripts, styles, comments and head dropped, capped at 2000 characters) and the numbered labels of its links (the element's text, else its `aria-label` or `title`, else `(unlabelled)`; `data-inert` elements are not choices; duplicates are one choice; a back control appears only after the first move). It never sees a screen id, a `data-to` value or the design's intent. Run each walk as a fresh subagent that is told nothing about the design.

A walk ends when the `target` text appears on the screen reached (`reached`), on `give_up`, or after 25 moves (`gave_up`). The optional `note` (at most 300 characters; the last one is kept) is what the user expected at that point.

**Score**, computed on read from the stored path and never stored (`src/walk-score.ts`, pure):

| Field | Meaning |
|---|---|
| `steps` | moves made |
| `shortest` | moves on the shortest `data-to` path from the start to a screen whose text shows the target (back is not a move); null when there is none |
| `wrong_turns` | moves that ended farther from the goal than they began, or with no way to it; moves out of a place with no way to the goal are not counted again |
| `dead_ends` | distinct visited screens, not the goal, with no choices at all |
| `reached` | whether the goal text appeared |

`read_walk` returns the walk with each step's `wrong` flag. Walks are rows of the table `walks`; events (`walk.started`, `walk.step`, `walk.ended`) carry only ids.

## Tournaments

`tournament_start(project, canvas, goals, runs?, canvases?)`: `goals` are 1 to 6 of `{goal, target}` (`goal` is what a user wants in plain words, up to 200 characters; `target` is text that appears where it is done, up to 100); `runs` is walks per goal and canvas, 1 to 5, default 3; `canvases` defaults to the base and every variant and must be at least two. Goals and the canvas list are fixed at the start so no variant is judged by goals written after seeing it. It answers a **plan**: one item per canvas, goal and run. Run each item as its own fresh subagent with `walk_start(tournament, canvas, goal_index)`; a pairing accepts only its `runs` walks.

`tournament_results(project, tournament)` answers `{goals, canvases, progress: {done, total}, complete, cells, walks}`. A cell holds, over the finished walks of one canvas and goal: `finished`, `reached`, `avg_steps`, `shortest`, `avg_wrong_turns`, `dead_ends` and the users' `expectations`. Lite does not pick a winner; the page only outlines the best cell per goal (most reached, then fewest wrong turns, then fewest steps; a tie among all marks none).

The Claude Code plugin ships the `lite-tournament` skill and a `/tournament` command that run this process (goals first, fresh subagents, honest caveat, no merge without the owner's word): see [Plugin](plugin.md).

## On the watch page

| Route | Shows |
|---|---|
| landing | a design with variants is one stacked card with a **N variants** chip; its variants are hidden from the grid |
| `#/project/<id>/canvas/<cid>/variants` | **Compare**: the base and every variant side by side (live start-screen thumbnails), **Fork** (name, now or an earlier point on the timeline) and **Run tournament** (a sentence to say) |
| `#/project/<id>/canvas/<cid>/tournament` | **Results** of the newest tournament on the base: progress bars while walks run (live), the goals-by-versions matrix, what users said they expected, and **Keep ...** buttons that show the sentence to say to Claude |
| `#/project/<id>/canvas/<cid>/trace/<walk>` | one walk drawn over the link graph (visited screens, green path, dashed wrong turns), the user's words and the score; reached by clicking a result cell |

The page only reads, except **Fork**, which posts `POST /api/projects/<id>/canvases/<cid>/fork` with `{name, seq?}` (token or session, same-origin only). Keeping a winner is a sentence to say, never a button. Motion follows [transitions.dev](https://transitions.dev): dialogs use the modal transition, cards and result blocks the staggered rise, bars a smooth width tween, all off under `prefers-reduced-motion`.

| Endpoint | Does |
|---|---|
| `GET /api/projects/<id>/canvases/<cid>/variants` | the `list_variants` answer |
| `POST /api/projects/<id>/canvases/<cid>/fork` | the `fork_canvas` answer; 409 for an existing id or the canvas limit |
| `GET /api/projects/<id>/tournaments/<tid>` | the `tournament_results` answer |
| `GET /api/projects/<id>/walks/<wid>` | `read_walk` plus `screens: [{id, name, links}]` for the drawing |

`GET /api/projects/<id>/canvases` entries gain `forked_from` (the base id or null).

## Code

`src/variants.ts` (fork, list, merge), `src/walk-score.ts` (what a user sees, distances, scoring), `src/walks.ts` (walk store), `src/tournament.ts` (tournaments and results), thin wiring in `src/hub.ts`, `src/mcp.ts`, `src/api.ts`, `src/index.ts`; migration 11 adds `canvases.forked_from` and the tables `tournaments` and `walks`. The page is `web/variants.ts` (pure), `web/variants-view.ts`, `web/tournament-view.ts`, `web/motion.ts` and `web/chrome.ts`.

## Not in this version

Auto-picking a winner, a model call inside the Worker, a live view of a single walk as it happens, merging only some screens, branching a variant from the page into more than one level of UI (the data allows it), real-user testing.
