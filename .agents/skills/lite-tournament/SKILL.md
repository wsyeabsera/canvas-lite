---
name: lite-tournament
description: Try several versions of a Lite design and let blind synthetic users choose with evidence. A process, not a tool list - goals first, then forked variants, then fresh subagents that walk each variant without knowing the design, then a scored comparison for the owner to decide. Use when asked to compare design options, A/B a flow, try a few directions, or find which version is easiest to use.
---

# Lite tournament: a process

Goal: the owner picks a version from evidence instead of from your description of it. You never pick the winner, and you never call the result proof: the users are simulated. Follow the steps in order. Tool shapes and the scoring rules: `docs/variants.md`. Needs the Lite MCP server (`lite` tools).

## The process

1. **Write the goals first.** 1 to 6 things a user wants to do ("buy a ticket", "change the address"), each with a `target`: text that appears on the screen where it is done ("Order confirmed"). Write them before any variant exists and do not change them afterwards, or a variant is judged by goals written after seeing it.
2. **Check the base is walkable.** It needs a start screen and links, and each target text must appear somewhere (`validate_flow`, `review_prototype`). A goal that no screen satisfies cannot be scored.
3. **Fork the variants.** `fork_canvas` once per direction (3 is plenty), each with a name that says the idea ("One-page checkout"). Change each variant with the usual tools (`set_screens`, `patch_screen`), following the project's design system. Keep the variants really different; two near-copies teach nothing.
4. **Start the tournament.** `tournament_start` with the goals (and `runs`, default 3). It returns a plan: one item per (canvas, goal, run).
5. **Run every plan item as its own FRESH subagent.** Give it only the project, the tournament id, the canvas and the goal index, and tell it to play a user who has never seen this design: call `walk_start`, then `walk_step` with the number of the link it would press, add a `note` saying what it expected, and `give_up` if it cannot find a way. Never reuse a subagent for a second walk and never tell it anything about the design, the other variants or the screen ids: a user who knows the design measures nothing. Run them in parallel where you can.
6. **Read the results.** `tournament_results` until `complete` is true. Show the owner the matrix (reached, steps against the shortest path, wrong turns) and the users' own words. Say plainly that these are simulated users and a strong signal, not proof, and that the winner should be checked with real people.
7. **The owner chooses.** Only when told which variant to keep, call `merge_variant`. The old base is kept as a variant, nothing is lost. If the owner wants another round, fork again from the winner.

## Checklist

- [ ] Goals and targets written before the variants, unchanged since
- [ ] Every walk was its own fresh subagent that was told nothing about the design
- [ ] The result was shown with the caveat that the users are simulated
- [ ] No merge without the owner naming the variant
