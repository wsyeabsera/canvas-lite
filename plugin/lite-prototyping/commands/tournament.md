---
description: Fork a Lite design into variants, test each with blind synthetic users, and show a scored comparison to choose from
argument-hint: <design and what users should be able to do>
---

Run a variants tournament in Lite: $ARGUMENTS

Use the `lite-tournament` skill and run its process in order, without skipping steps:

1. Write the goals and their target texts first, before any variant exists.
2. Check the base is walkable, then fork 3 genuinely different variants and build each one.
3. `tournament_start`, then run every plan item as its own fresh subagent that is told only the goal and that nothing in the prototype is real (so pressing Pay is safe), never anything else about the design.
4. Read `tournament_results` until it is complete and show the owner the matrix and the users' own words.
5. Say these are simulated users, a signal and not proof. Do not pick the winner and do not merge until the owner names a variant.

Finish with the tournament id and where to see it on the watch page (`#/project/<id>/canvas/<base>/tournament`).
