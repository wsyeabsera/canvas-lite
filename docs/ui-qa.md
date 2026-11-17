---
sidebar_position: 8
slug: /ui-qa
---

# UI/UX QA backlog (2026-11-17)

Desktop only. Found by hand on the deployed Worker with Claude in Chrome (1512 x 789), signed in, project `paperfolio`. Each item is a task; `P1` hurts now, `P2` should be fixed, `P3` polish. "Unverified" means it needs a second look before work starts.

## Done (shipped with this list)

- Home: **Latest design** strip replaces the presenter banner (hidden when Continue shows the same design); no `0 designs` or empty state before the first list arrives; the header count matches the gallery (`8 designs · 10 variants`); Activity is a real pill link; phone designs fill the card width and show their top; variant chip has an icon; top bar actions share one pill style; the theme pill is an icon plus the choice; the search shows `3 of 8`, a clear action on no match, and a sort menu (Newest, Name, Most screens); exact time on hover; scroll position returns when you come back; visible focus rings everywhere; softer card and menu motion (reduced motion respected); slightly lighter muted text.
- Canvas: 10 or more screens lay out in more columns (25 screens: 7 across, not a 9-row tower), so Fit is about 70 % larger; the size label hides when the frame is narrow and the full name is a tooltip; zoom moves between round stops (8, 10, 12.5, 15, 20, 25, 33, 50, 75, 100 %); breadcrumb `project / design`; a Go to screen menu; a `?` shortcut list; Watch is hidden when there is nothing to watch; hints on the back arrow and the `live` pill.
- Play and Walkthrough: a Loading label while the first frame arrives; the Walkthrough header says `1 of 25 screens (the linked path)` instead of `1 screen`. The "cropped frame" and "blank Play" findings were the frame still loading, not a failure: both render fine after about 3 seconds.
- Project page: letter tiles instead of grey placeholders, **Open gallery** and **Design system** links.
- Design system page: font specimens, swatches copy their value on click, the summary line sits under the title, the tabs switch with the arrow keys.

## Done in the follow-up pass

- One shared state block (`web/states.ts`, `web/states-view.ts`) for loading, empty, missing and error, with a retry or a way back, used by the canvas, design system, variants, tournament, admin and landing. A missing design hides Play, Walkthrough, zoom and the map.
- A canvas **minimap** (bottom left, shown above 4 screens): click or drag to move the view.
- The activity and project pages now use the landing's flat top bar and pill buttons; empty lists say so.
- Browser tab titles per route (`Revamp desktop · paperfolio · Lite`); the landing is a `main` landmark; filter chips are 28 px high; thumbnails fade in instead of flashing white; fonts specimen order fixed; the sign-in copy no longer says "watch what Claude is designing".
- Page and rail motion use the transitions.dev tokens (12 px, 250 ms ease-out), off under reduced motion.
- Covered by hand on the deployed site: Admin, Activity, variants, tournament (empty), a 3D scene in Orbit, the sign-in page and the docs site. Admin, variants, scenes and docs needed no change beyond the shared pieces above.

## Done in the last pass

- **Contrast, measured.** A script computed the contrast of every visible text node (composited over its backgrounds) in the dark and light themes on the home page, design system, admin, activity, project page and variants. Failures and fixes: white on the blue buttons 4.43:1, now 5.1:1 (`#3660f0`); light-theme green badge text 3.1:1, now 6:1 (`--ok-text`); light-theme variant names 2.4:1, now tinted toward the text colour; the hover scrim behind the card buttons is darker. Everything else already passed 4.5:1 (3:1 for large text).
- **Keyboard only, with real Tab presses.** Home: Project, Search, Admin, Sign out, docs, Theme, Files and events, Design system, filter chips, Sort, then each card's Play, Walkthrough and Watch (they appear on focus). Canvas: Back, Play, Walkthrough, Watch, Replay, docs, Theme, Go to screen, zoom buttons, Fit. Every stop had a visible ring except two (project menu items, variant cells), now fixed. Found and fixed: the `?` shortcut list opened non-modally and Escape did not close it (now a modal dialog), and the tab title showed the design id instead of its name.
- **Project page folded in.** The home header has a **Files and events** link next to **Design system**, and the project page links back with **Open gallery**. The page stays as the place for the file list and events (the home page does not show those), now in the same shell.
- **Checked live:** tournament results with data (the-mailroom, Admin UI), a walk trace, scene Page (its empty state) and Watch (the film picker). The trace had a bright vertical bar (many same-column links stacked) and its right side was cut off with no cue: same-column plain links are no longer drawn and a "Scroll sideways" hint shows when the map is wider than its card.

The original findings follow, unchanged, for reference.

## Home (landing)

- **P1** First paint says `0 designs` and "Nothing yet in paperfolio. Ask Claude to design something." for about a second before the real data arrives. Show a skeleton, never the empty state, until the first list has settled.
- **P1** Header says `18 designs` but the gallery and chips say `All 8` (variants are stacked). Make the count and the gallery agree, or say `18 designs · 8 shown`.
- **P1** The "Activity" link at the bottom is a bare grey word with nothing under it. Make it a real link or remove it.
- **P2** Phone designs get a tiny sliver in a wide empty thumbnail. Fit phones on a device-shaped backdrop at a readable size.
- **P2** Variant stacks (`1 variant`) show a peeking card edge that reads as a rendering glitch. Give it a clear stack affordance and a count.
- **P2** Cards offer Play and Walkthrough only on hover. Show the primary action on focus and give keyboard users a visible focus ring.
- **P2** Top bar: `Admin`, `Sign out`, `docs` and `Theme: dark` have four different looks. One style for actions, one for links.
- **P2** The theme pill says `Theme: dark` and cycles through `auto`. Use an icon with a tooltip and show all three states.
- **P3** Search has no result count, no clear button and no "no match" hint beyond "No designs match."
- **P3** The Continue card repeats the first gallery card. Collapse one into the other when the last design is first in the list.
- **P3** Sort order is fixed (newest first). Offer name, screen count and playable.
- **P3** Card meta says `yesterday` and `7 days ago`. Add the exact time on hover.

## Canvas

- **P1** Opening a canvas shows it at 8 % in a narrow 3-column strip with the rest of the viewport empty; **Fit** gives the same result. Fit must use the viewport width.
- **P1** Screen labels are cut to `To…`, `As…`, `Tra…` and overlap the `1280 × 800` size. Show the full name above each frame, size on hover.
- **P2** Zoom steps are uneven (8 % to 15 % after three clicks). Use fixed steps, support pinch and Ctrl-scroll, and show a reset.
- **P2** No minimap, no search for a screen, no way to jump to a screen by name.
- **P2** The `live` pill gives no hint what it means.
- **P3** Back arrow has no label; a breadcrumb (`paperfolio / Revamp desktop`) would help.
- **P3** `docs` link on the canvas takes you away from the work with no new tab.

## Play, Walkthrough, Replay, Watch

- **P1** Walkthrough lists one screen and draws the frame cropped to about 125 px high with a large blank area below. The frame must fit the stage.
- **P1 (unverified)** Play and Replay stayed on a blank dark screen for 5 s with no loader and no error. Add a loading state, an error state and a timeout message.
- **P2** The Walkthrough side panel says `1 screen` for a 25-screen design. Check what the list is built from.
- **P2** `Watch` is shown on every design and disabled when there are no scenarios, with the reason only in a tooltip. Say why in text or hide it.
- **P2** Exit is `Esc` only on the walkthrough chip; Play and Replay show no way out.

## Project page (`#/project/<id>`)

- **P1** The project page uses a different layout and tone from the home page (a narrow column, a plain list, a `connected` and `read-only` status, `Designs` back link). Pick one design language.
- **P2** The list shows empty grey placeholders where thumbnails should be.
- **P2** The `Admin` and project switcher are missing here, so you cannot change project without going Home.

## Design system page

- **P2** The Fonts card is mostly empty while Type sizes is long. Balance the grid, and render real specimens.
- **P2** The header line (`13 colors · 2 fonts · 11 sizes · 6 space tokens · 4 radii`) is tiny and cramped beside the title.
- **P3** Colour swatches do not copy their value on click.
- **P3** `Tokens` and `DESIGN.md` tabs have no keyboard hint.

## Cross-cutting

- **P1** No loading, empty or error states are shared across views; each draws its own.
- **P2** Hash routes (`#/project/...`) lose scroll position and the selected filter on back.
- **P2** Everything is glass on a moving blurred backdrop; contrast of grey meta text (`updated yesterday`) is low. Run a contrast pass.
- **P2** Focus order, visible focus and `aria-label` coverage need an audit.
- **P2** No keyboard shortcut help (`P`, `W`, `V` exist on the canvas but are not discoverable).
- **P3** Motion: apply the transitions.dev tokens to the dropdown, cards, panel and page changes (`transitions-polish`).
- **P3** Console is clean on load; keep it that way.

## Not covered

Nothing known.

## Last items closed

- The tab title of a scene shows its name (from the project's scene list), not its id.
- Scene film playback and a scene with a page (`tvdash/harbor-town`) were opened live; contrast was re-measured on the design system, admin, activity, project page and variants in both themes.
