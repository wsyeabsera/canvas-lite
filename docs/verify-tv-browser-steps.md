---
sidebar_position: 31
slug: /verify-tv-browser-steps
---

# Verification: TV browser and steps canvases

Task #1971. Report only: nothing on the Lite Worker and nothing in the tvdash repo was changed.

Checked: Lite project `tvdash`, canvas `tv-browser` (screens 25 to 34) and canvas `tv-steps-wall-pairing-voice-keys` (screens 35 to 43). Each screen's html was compared with the inventory in `docs/tvdash-tv-screens.md` and with the Compose code in `/Users/yab/Hobby/tvdash/tv/app/src/main/kotlin/dev/tvdash/ui/` (paths below are relative to that folder) and `res/values`. The canvases are 1920 x 1080 px, the code is in dp at 2 px per dp (960 x 540 dp), so 1 dp = 2 px. A sentence such as "28 px" in a mismatch is a design px value, "14 dp" a code value.

Verdict rules: **Match** = copy, colours and sizes agree. **Mismatch (n)** = n exact differences, listed in the section. Every screen also holds sample data (see PLACEHOLDER lines). "G2" below is a cross-cutting difference counted once per screen that shows a focus ring.

## Summary

| Screen id | Name | Verdict | Mismatches |
|---|---|---|---|
| 25 | Browser start page | Mismatch | 1 |
| 26 | Browser: page view | Match | 0 |
| 27 | Browser: address and controls bar | Match | 0 |
| 28 | Browser: quick actions sheet | Mismatch | 2 |
| 29 | Browser: Bookmarks / History panel | Mismatch | 2 |
| 30 | Browser: Shields panel | Match | 0 |
| 31 | Browser: Video found on this page | Mismatch | 1 |
| 32 | Browser: numbered links | Match | 0 |
| 33 | Browser: pills | Mismatch | 2 |
| 34 | Browser: web video full screen | Match (stand-in) | 0 |
| 35 | Steps: a step, no timer | Mismatch | 1 |
| 36 | Steps: timer ready / paused / running | Mismatch | 1 |
| 37 | Steps: timer done banner + chime | Mismatch | 1 |
| 38 | The wall (pins grid) | Mismatch | 5 |
| 39 | The wall: one pin full screen | Match | 0 |
| 40 | The wall: unpin sheet | Mismatch | 2 |
| 41 | Pair a device | Mismatch | 4 |
| 42 | Voice banner | Mismatch | 4 |
| 43 | Keys, typing, touch, volume from the hub | Mismatch | 3 |

Totals: 19 screens. **6 Match** (26, 27, 30, 32, 34, 39; 34 is a stand-in), **13 Mismatch** (25, 28, 29, 31, 33, 35, 36, 37, 38, 40, 41, 42, 43), **19 with placeholder data**. Total mismatch count: 29, of which 7 are the G2 focus-ring gap.

## Cross-cutting differences

- **G1, glass border.** Every design glass surface uses a flat 2 px border `rgba(255,255,255,.12)`. The code (`Components.kt:57`) draws a 1 dp vertical gradient from `hairline` `#2EFFFFFF` (18%) at the top to white 5% at the bottom (22% when focused). The flat value is close to the gradient's mean, so this is treated as an approximation and not counted per screen.
- **G2, focus ring gap.** Code (`Components.kt:144`, `:155`): white ring 3 dp (6 px) wide, drawn 4 dp (8 px) outside the item, so the ring spans 8 to 14 px outside the edge, with a transparent gap. Designs draw it as `box-shadow:0 0 0 6px #fff` (28, 31) or a border at inset -8 px (29, 38, 41, 42), which sits 0 to 2 px outside the edge. Screen 40 uses a 6 px ink gap plus a 3 px white ring. None match the code. Counted once on 28, 29, 31, 38, 40, 41, 42.
- **G3, eyebrow case.** `Type.eyebrow` (`Theme.kt:79`) has no upper-casing. The code draws the string as written ("Bookmarks", "Recent", "From your laptop's TV folder", "Paired · hold OK to unpair"). Designs 25, 29 and 41 show them in capitals.
- **Backdrop (screens 35 to 43).** Aurora fields match `Aurora.kt:74-89`: three radial fields at (0.78 w, 0.12 h, r 0.55 w, alpha .30 accent blue), (0.12, 0.95, r 0.50, purple .14), (0.40, 0.55, r 0.40, teal .08), a vertical `#0C0E15` to `#05060A` base and a 65% vignette. The design freezes the drift at its start phase.
- **Status pill** ("Connected", top-right, 96 / 54 px, caption 30 px, 16 px green dot, padding 28 x 14 px, `glass`): matches `Components.kt:75-92`.

## Browser canvas (`tv-browser`)

### 25 Browser start page

Source: `StartPage.kt:41`, `:79`.

- VERIFIED: root padding 144 x 86 px (72 x 43 dp), 40 px gap (20 dp), button row gap 24 px (12 dp), button padding 24 x 20 px (12 x 10 dp), callout 36 / 48 px, label colour `rgba(235,235,245,.7)` (`textSecondary`), eyebrow 28 px weight 600 tracking .14em `.45`, 20 px under it (10 dp), tiles 480 x 248 px, radius 48 px (24 dp), padding 36 px (18 dp), 12 px gap, gap between tiles 32 px, title callout `#F5F5F7`, 2 lines, host caption `.45`, focused tile `.14` fill, border `.22`, scale 1.04, no ring. Three tiles per row (`TILES_PER_ROW`). "Search or type an address" and "Clear history" copy.
- MISMATCH: section labels are drawn in capitals ("BOOKMARKS", "RECENT"); code writes "Bookmarks" and "Recent" (`StartPage.kt:63`, `:66`, no caps in `Theme.kt:79`). (G3)
- PLACEHOLDER: all six tile titles and hosts (Hacker News, Wikipedia, tvdash/tvdash, aurora article, BBC News, Brave Search), which tile is focused. Code shows "Clear history" only when `recent` is not empty; the design always shows it.

### 26 Browser: page view

Source: `TvBrowser.kt:768`, `:793`, `:986`, `:1019`.

- VERIFIED: progress bar 6 px (3 dp) `#0A84FF` at top (`TvBrowser.kt:769`); link ring 6 px (3 dp) `#0A84FF`, radius 16 px (8 dp), outer edge 4 px outside the link (`LinkRing`, `:987-993`); hint pill top-right at 96 / 54 px, ink 80%, padding 28 x 14 px, caption 30 px `.7`, exact copy "◀▲▼▶ next link · hold ▲▼ scroll · OK open · hold OK more" (`:794`).
- MISMATCH: none.
- PLACEHOLDER: the whole page behind (Northern Lights Weekly article, colours `#f4f1ea`, `#0645ad`, Georgia text, the video block), bar width 1170 px (61%), the linked words.

### 27 Browser: address and controls bar

Source: `BrowserBar.kt:50-143`.

- VERIFIED: bar at left/right 96, top 54 px, radius 56 px (28 dp), `rgba(12,14,21,.94)`, 2 px (1 dp) `.18` border, padding 24 px (12 dp), gap 20 px (10 dp); address pill padding 56 x 28 px (28 x 14 dp), body 44 / 64 px, `#F5F5F7`, focused fill `.14` and `#0A84FF` border; buttons gap 8 px (4 dp), padding 24 x 20 px (12 x 10 dp), callout 36 px `.7`, disabled alpha .35 (Forward), spacer before "Close"; copy and order: Back, Forward, Reload, Bookmark, Shields, Desktop site, Mouse off, Close.
- MISMATCH: none.
- PLACEHOLDER: the URL, the selected-text highlight, the page behind.

### 28 Browser: quick actions sheet

Source: `TvBrowser.kt:812`, `QuickActions.kt:16`, `ActionSheet.kt:88-133`.

- VERIFIED: scrim black 55%; sheet 680 px (340 dp) wide, right inset 96 px (48 dp), radius 64 px (32 dp), padding 48 px (24 dp), 20 px gap (10 dp); title 56 / 68 px weight 600, -.01em; rows radius 24 px (12 dp), padding 36 x 28 px (18 x 14 dp), callout 36 / 48 px, unfocused `glass` .08, focused `#F5F5F7` with `#05060A` text, lift 1.02. Copy and order match `quickActions` (the conditional "Play the video directly" is correctly absent without a video).
- MISMATCH: (1) focus ring: design 6 px spread with no gap, code 6 px ring starting 8 px out (G2). (2) the title is single-line with ellipsis in the design, the code allows 2 lines (`ActionSheet.kt:106`, `maxLines = 2`).
- PLACEHOLDER: title text (page title), which row is focused, the bookmarked state ("Bookmark this page" vs "Remove the bookmark"), "Hide the blocked count" state.

### 29 Browser: Bookmarks / History panel

Source: `LibraryPanel.kt:67-174`.

- VERIFIED: scrim 60%; glass panel x 800 to 1824, y 54 to 1026 (the 560 dp width minus 48 dp end padding, 27 dp vertical padding), radius 64 px; content padding 48 px, gap 28 px; tab row gap 20 px; tabs title 56 px, selected `#F5F5F7` on `.14` pill, padding 32 x 12 px, other `.45`; hint "◀ ▶ switch · hold OK remove" caption, 16 px extra start margin; list padding 12 px, gap 12 px; row radius 28 px, padding 28 x 20 px, gap 28 px; circle 80 px with the initial in callout; title callout, host caption `.45`; ground colours `#233150`, `#2A3B2F`, `#3B2A35`, `#2E2A3B`, `#3A3222` are the five in `Home.kt` `tileGrounds`.
- MISMATCH: (1) section header "FROM YOUR LAPTOP'S TV FOLDER" in capitals; code draws "From your laptop's TV folder" (`LibraryPanel.kt:81`, `:127`). (G3) (2) focus ring on the first row: design 6 px ring at inset -8 px, radius 36 px; code ring spans 8 to 14 px outside with corner 14 dp + 5.5 dp (39 px) (G2).
- PLACEHOLDER: the three bookmark titles and hosts, which ground colour sits on which row (code picks by URL hash, `Home.kt:259`), the laptop bookmarks (BBC News, Brave Search), the page behind.

### 30 Browser: Shields panel

Source: `ShieldsPanel.kt:33-80`.

- VERIFIED: right 96 / top 54 px, width 1120 px (560 dp), radius 56 px, `rgba(12,14,21,.96)`, 2 px `.18` border, padding 56 px (28 dp), gap 24 px (12 dp); header dot 24 px (12 dp) `#30D158`, title 56 px; lines callout 36 px `.7`; buttons pill 24 x 20 px, first one focused `#F5F5F7`; copy "Shields up for `<site>`", "`<n>` ads and trackers blocked", "`<n>` scripts blocked", "`<n>` ad elements hidden", singular "1 redirect stopped", "Turn Shields off for this site", "Hide the blocked count".
- MISMATCH: none.
- PLACEHOLDER: site name northernlightsweekly.com, the counts 14, 5, 3, 1.

### 31 Browser: Video found on this page

Source: `TvBrowser.kt:870-878`, `ActionSheet.kt`.

- VERIFIED: copy "Video found on this page", "Play it directly", "Stay on the page"; sheet geometry as screen 28, vertically centred (`contentAlignment = CenterEnd`), scrim 55%.
- MISMATCH: focus ring without gap on "Play it directly" (G2).
- PLACEHOLDER: the page behind.

### 32 Browser: numbered links

Source: `TvBrowser.kt:971-982`.

- VERIFIED: tag at offset -6 / -10 px from the link's top-left, caption 30 / 40 px, text `#05060A`, fill `#FF9F0A`, radius 12 px (6 dp), side padding 10 px (5 dp). Numbers in reading order from 1.
- MISMATCH: none.
- PLACEHOLDER: nine links and their numbers, the page content.

### 33 Browser: pills

Source: `TvBrowser.kt:793-948`, `:1019-1031`.

- VERIFIED: pill ink 80%, padding 28 x 14 px (14 x 7 dp), caption 30 px `.7`, shield dot 16 px (8 dp) green, gap 16 px (8 dp). Hint at top-right (96 / 54 px). Notice "Bookmarked" at top 108 px (27 dp padding plus the pill's own 27 dp). Bottom-right "`<n>` blocked" at 96 / 54 px. Presenter dot 56 px (28 dp) orange 85% (`:798-804`). Copy of all five pills.
- MISMATCH: (1) "Presenting from your laptop": design at left 96 / top 54 px; code adds `padding(Spacing.safeHorizontal)` on all sides (48 dp) before the pill's own margins, so it sits at about x 192 px, y 150 px (`TvBrowser.kt:807`). (2) "▶❙❙ plays this page's video directly": design at left 96 / bottom 54 px; code sits at about x 192 px, bottom 150 px for the same reason (`:810`). The inventory already says some call sites sit at double margins; the design does not show it.
- PLACEHOLDER: "12 blocked", which pills show together (in the app the hint lasts 4 s and the notice 2.5 s), the pointer dot position.

### 34 Browser: web video full screen

Source: `TvBrowser.kt:746`, `:373`.

- VERIFIED: nothing is drawn by the app; the design is a stand-in (gradient and the caption "Page video, full screen (Chromium's own view, not drawn by the app)").
- MISMATCH: none.
- PLACEHOLDER: the whole picture and the caption (design annotation only).

## Steps, wall, pairing, voice, keys canvas (`tv-steps-wall-pairing-voice-keys`)

### 35 Steps: a step, no timer

Source: `Steps.kt:98-153`.

- VERIFIED: scene box x 96 to 1824, y 142 to 1026 px; 48 px column gap (24 dp); header gap 32 px; segments 56 x 12 px, radius 6 px, gap 12 px, `#FF9F0A` up to the current step, `.14` after; title callout 36 px `.7`; "Step 2 of 5" title style 56 / 68 px `#FF9F0A`; hero 88 / 100 px `#F5F5F7`; detail body 44 / 64 px `.7`; column gap 36 px (18 dp); body row gap 96 px (48 dp); footer "OK next step · ◀ previous" caption `.45`.
- MISMATCH: the design centres the text block vertically in the body area; the code body `Row` has no vertical alignment (top aligned) (`Steps.kt:133`).
- PLACEHOLDER: "Roast chicken", the step text, the detail text, "2 of 5".

### 36 Steps: timer ready / paused / running

Source: `Steps.kt:156-176`.

- VERIFIED: ring 440 px (220 dp), track `.14` 28 px (14 dp) stroke, orange arc from 12 o'clock, round cap, radius 206 px (arc inset by half the stroke); time in hero 88 / 100 px, label caption `.45` ("running" / "paused"); footer "OK next step · ◀ previous · ▶❙❙ pauses the timer · ⏩ +1 min" (the code also writes "starts the timer" when not running).
- MISMATCH: the ring is vertically centred in the design; the code `Row` is top aligned, so the ring sits at the top of the body (same cause as 35, `Steps.kt:133`, `:139`).
- PLACEHOLDER: "Roast until the skin is golden", "4:12" (arc 1087 of 1295 = 84% = 4:12 of 5:00), step 3 of 5, detail "74 °C".

### 37 Steps: timer done banner + chime

Source: `Browser.kt:354-358`, `:373-379`.

- VERIFIED: banner top 70 px (35 dp = 27 + 8), centred, glass pill, padding 56 x 28 px (28 x 14 dp), title 56 / 68 px `#F5F5F7`, copy "Timer done: `<step text>`"; ring empty at "0:00" labelled "paused"; footer "starts the timer".
- MISMATCH: same body alignment as 35 / 36.
- PLACEHOLDER: step text in the banner. The chime (`ToneGenerator`, `TONE_PROP_BEEP2`, 1.5 s, volume 100) has no visual.

### 38 The wall (pins grid)

Source: `Wall.kt:138-222`.

- VERIFIED: header row at y 54 px, gap 40 px (20 dp), clock hero 88 / 100 px, date callout `.7` "Friday, 6 November" (format `EEEE, d MMMM`, `Format.kt:17`), hint "OK full screen · hold OK unpin · Back home" caption `.45`; grid top at 194 px (54 + 100 + 40); three columns for six pins (`wallColumns`), column gap 48 px (24 dp); picture radius 32 px (16 dp), ground `#0C0E15`; title callout `#F5F5F7`, age caption `.45`; focus lift 1.03.
- MISMATCH: (1) row gap 28 px in the design; 24 dp = 48 px in code (`Wall.kt:184`). (2) tile spacing: the design adds a 20 px margin around every tile on top of the gaps (88 px between pictures, 504 px wide); the code uses 10 dp = 20 px content padding around the whole grid only (48 px between pictures, about 537 px wide) (`:185`). (3) picture height: 250 px in the design; the code computes `(maxHeight - 20 dp) / rows - 24 dp - 32 dp`, about 142 dp = 284 px for two rows (`:180`, computed, not measured on a device). (4) the age sits under the title in the design; the code puts title and age on one row, age at the right (`:218-221`). (5) focus ring: design wraps the picture only (266 px high, no gap); the code ring wraps the whole tile including the text, 8 px off the edge (G2).
- PLACEHOLDER: clock 14:32, date, six pin titles and ages, the pictures (all drawn as shapes; real pictures come from the hub).

### 39 The wall: one pin full screen

Source: `Wall.kt:159-167`.

- VERIFIED: safe margins 96 / 54 px, title 56 / 68 px, caption `.45` "`<age>` · Back to the wall", 32 px between header and picture (16 dp), picture fills the rest with radius 32 px on `#0C0E15`, fitted.
- MISMATCH: none (the design aligns header text by baseline, the code by bottom; not counted).
- PLACEHOLDER: "Grafana: API latency", "just now", the picture and its 1300 px width.

### 40 The wall: unpin sheet

Source: `Wall.kt:200-202`, `ActionSheet.kt`.

- VERIFIED: sheet geometry and typography as screens 28 / 31; copy "Unpin" and "Keep it", title = pin title; scrim 55%.
- MISMATCH: (1) the sheet fill is an opaque `#14161d` (`background-color`) in the design; the code fill is translucent `glass` (8% white) over the dimmed wall. (2) the focused row ring is a 6 px ink gap plus a 3 px white ring (`box-shadow:0 0 0 6px #05060A,0 0 0 9px #fff`), unlike the code ring (8 px gap, 6 px wide) and unlike screens 28 / 31 (G2).
- PLACEHOLDER: the six tiles behind, "Grafana: API latency".

### 41 Pair a device

Source: `Pairing.kt:76-205`, `Qr.kt:38-54`, `HubAuth.kt:69`.

- VERIFIED: wrap 96 / 54 px, gap 80 px (40 dp); left gap 36 px (18 dp); hero 88 px; instruction callout 36 px `.7` (exact copy); code 144 / 160 px weight 300, -.03em, `123 456` spacing; "Works for `<m:ss>`, once" callout `.45`; code to QR gap 48 px (24 dp); QR 336 px (168 dp), radius 40 px (20 dp), padding 28 px (14 dp), modules `#0B0B0F` on white; "Back closes this and ends the code" caption; right column 680 px (340 dp), gap 24 px (12 dp); rows gap 12 px (6 dp), radius 28 px, padding 32 x 20 px (16 x 10 dp), lift 1.02; row copy "`<kind label>` · seen `<relative>`" with kind labels from `deviceKindLabel`.
- MISMATCH: (1) the left column is vertically centred in the design; the code column is top aligned (`Pairing.kt:133`). (2) the right column starts 140 px (70 dp) down in the design; in the code it starts at the top (`:167`). (3) the eyebrow "Paired · hold OK to unpair" is upper-cased by the design (`text-transform:uppercase`); the code draws it as written (`:168`) (G3). (4) focus ring on the first row (G2: design inset -8 px / radius 36 px, code 8 px gap, radius 39 px).
- PLACEHOLDER: the code `123 456` and `4:32`, the QR matrix (the real one encodes `<hub>/remote#pair=<code>`), the five device names ("Living room TV", "Chrome on MacBook", "yab's iPhone", "Claude Code on yab-mac", "Morning shortcut") and their seen-times. The problem line, the unpaired-requests warning and the empty list are not drawn.

### 42 Voice banner

Source: `Browser.kt:359-368`, `TvdashScreen.kt:129-147`, `Toolbar.kt:47-118`.

- VERIFIED: banner top 70 px (35 dp), padding 52 x 24 px (26 x 12 dp), callout 36 / 48 px `#F5F5F7`, exact copy `Listening… say "pause", "next" or "play" and a title` (browser closed). Clock Inter Display Thin 312 px, -.03em; date 52 px weight 500 `.7` with 12 px start padding; "Ask Claude to put something on this screen" callout `.45`, 36 px above (18 dp); toolbar buttons gap 24 px, padding 36 x 22 px (18 x 11 dp), icon 40 px (20 dp), icon gap 20 px, callout 36 px, `glass` unfocused, focused `#F5F5F7` with `#05060A`, lift 1.04, disabled alpha .4 (Up next); toolbar padding 12 px. Labels Home, Browse the web, Bookmarks, History, Up next, The wall, Voice.
- MISMATCH: (1) the toolbar in the design has 7 buttons; the code has 9: "Refresh" and "Pair a device" follow "Voice" (`Toolbar.kt:61-62`). (2) block position: design bottom 48 px, left 104 px; code is 24 dp + 27 dp = 102 px from the bottom and 48 dp + 8 dp = 112 px from the left (`TvdashScreen.kt:132`, `SafeArea`). (3) the design focuses "Voice"; the code's idle home focuses "Browse the web" first (`focusFirst`, `:143`); the sample focus is plausible after pressing the mic key, so this is noted only. (4) ring on the focused button (G2: design ring at inset -8 px, radius 48 px; code corner 24 dp plus offset).
- PLACEHOLDER: clock 14:32, "Friday, 6 November", the focused button. The activity feed (`ActivityFeed.kt`) draws nothing when empty, so its absence is correct.

### 43 Keys, typing, touch, volume from the hub

Source: `BrowserBar.kt`, `TvBrowser.kt:796-805`, `:986-1016`.

- VERIFIED: bar as screen 27 (96 / 54 px, radius 56, `.94`, address `.14` with `#0A84FF` border, 44 px text, buttons with Forward at .35, "Mouse on"); pointer arrow 56 px (28 dp), white with a black outline about 3.4 px (6% of its width).
- MISMATCH: (1) the presenter dot is drawn at `transform:scale(.5)`, which gives 28 px; code size is 28 dp = 56 px (`TvBrowser.kt:801`). (2) the link ring sits 8 px outside the link (box 436 x 80 around a 420 x 64 element, border 6 px); the code ring's outer edge is 4 px outside (`LinkRing`, `:987-993`; screen 26 draws it correctly). (3) arrow geometry: the design path is (3,2), (3,22), (8,17.5), (11.5,25), (15,23.5), (11.5,16), (18,16) on a 28 unit box, so its tip is inset from the box corner; the code path (`:1003-1011`) starts at (0,0) with points at 0.82, 0.62, 0.95, 0.9, 0.58 of the width and its tip is the click point.
- PLACEHOLDER: address "tvdash.dev/docs/pairing" and its caret, the page blocks, pointer and dot positions. The volume bar and the key events have no tvdash UI by design.

## Unclear or not verifiable

- Cursor width and blink of the address field (`BrowserBar.kt:98` uses the Compose default); the design draws a 3 x 48 px caret.
- Whether the quick actions sheet clips its last rows: ten rows need about 700 dp (computed from `ActionSheet.kt`: 24 dp padding, 34 dp title, 52 dp rows, 10 dp gaps) on a 540 dp screen, and the sheet has no scroll. The design clips after about seven rows. Behaviour of focus on clipped rows needs a device check.
- The wall picture height (284 px) and the idle block offsets are computed from the layout code, not measured on a TV.
- Text metrics: design uses the Inter font and sp-to-px at scale 1.0 (inventory caveat); line breaks of long titles (hero, step text) were not compared.
- Aurora drift: the code moves the three fields over 60 s; designs show a single start position.
- Hint, notice and banner timings (4 s, 2.5 s, 15 s, 600 ms fade) are code behaviour with no visual in the designs.
- Icons: toolbar glyph strokes in screen 42 are SVG approximations; `drawGlyph` (`Toolbar.kt:121`) shapes were not compared point by point.
- Screen 34 has nothing app-drawn to verify; the canvas text is an annotation.
