---
sidebar_position: 30
slug: /verify-tv-home-player
---

# Verification: TV home, cards, link, GitHub and player canvases

Task #1971, report only. Two Lite canvases of project `tvdash` were compared with the real Compose code under `tv/app/src/main/kotlin/dev/tvdash/` (paths below are relative to that folder) and with [the TV screen inventory](/tvdash-tv-screens):

- `tv-home-cards-link-github`: 18 screens (12 main plus 6 "shader look" variants).
- `tv-player`: 13 screens (12 main plus 1 shader variant).

All canvases are 1920 x 1080 px, so 1 dp = 2 px (1080p at density 320). The design values below are converted to dp where the code speaks dp. No screen on the Lite Worker and nothing in the tvdash repo was changed.

Verdicts: VERIFIED (copy, colours, sizes and layout match the code), MISMATCH (at least one exact difference, listed), PLACEHOLDER (sample data in the design that the code does not define; every screen that has some lists them, and they are not counted as mismatches). The sample values are illustrative: hostnames, titles, times, ids, counts, error text, QR modules.

## Summary

Counts: 24 screens verified, 7 screens with mismatches (11 mismatches in all), 29 of 31 screens carry placeholder sample data (only screens 1 and 2 have none).

| screen id | name | verdict | mismatches |
|---|---|---|---|
| 1-app-frame-aurora-backdrop-scene-transi | 1 App frame: aurora backdrop + scene transition | VERIFIED | 0 |
| 2-connection-status-pill | 2 Connection status pill | VERIFIED | 0 |
| 3-idle-empty-home | 3 Idle, empty home | VERIFIED, placeholders | 0 |
| 4-home-with-rows | 4 Home with rows | VERIFIED, placeholders | 0 |
| 5-toolbar-all-button-states | 5 Toolbar (all button states) | VERIFIED, placeholders | 0 |
| 6-home-tile-actions-sheet | 6 Home tile actions sheet | MISMATCH | 2 |
| 7-card-info | 7 Card: info | MISMATCH | 1 |
| 8-card-success | 8 Card: success | MISMATCH | 1 |
| 9-card-warning | 9 Card: warning | MISMATCH | 1 |
| 10-link-card-with-qr-code | 10 Link card with QR code | VERIFIED, placeholders | 0 |
| 11-github-pr-issue-card | 11 GitHub PR / issue card | MISMATCH | 1 |
| 12-media-scene-drawn-as-a-link-card | 12 Media scene drawn as a link card | VERIFIED, placeholders | 0 |
| 3-idle-empty-home-shader | 3 Idle, empty home (shader look) | copy VERIFIED | 0 |
| 7-card-info-shader | 7 Card: info (shader look) | copy VERIFIED | 0 |
| 8-card-success-shader | 8 Card: success (shader look) | copy VERIFIED | 0 |
| 9-card-warning-shader | 9 Card: warning (shader look) | copy VERIFIED | 0 |
| 10-link-card-with-qr-code-shader | 10 Link card with QR code (shader look) | copy VERIFIED | 0 |
| 11-github-pr-issue-card-shader | 11 GitHub PR / issue card (shader look) | copy VERIFIED | 0 |
| 13-player-full-screen-loading-buffering | 13 Player, full screen: loading / buffering | VERIFIED, placeholders | 0 |
| 14-player-playing-controls-overlay-auto | 14 Player: playing (controls overlay, auto-hide) | VERIFIED, placeholders | 0 |
| 15-player-paused | 15 Player: paused | VERIFIED, placeholders | 0 |
| 16-player-live-stream | 16 Player: live stream | VERIFIED, placeholders | 0 |
| 17-player-press-back-again-to-leave | 17 Player: "Press Back again to leave" | VERIFIED, placeholders | 0 |
| 18-player-up-next-line-and-end-countdown | 18 Player: Up next line and end countdown | VERIFIED, placeholders | 0 |
| 19-player-error-can-t-play-this-video | 19 Player: error ("Can't play this video") | VERIFIED, placeholders | 0 |
| 20-player-ended | 20 Player: ended | VERIFIED, placeholders | 0 |
| 21-player-actions-sheet | 21 Player actions sheet | VERIFIED, placeholders | 0 |
| 22-up-next-tray | 22 Up next tray | MISMATCH | 1 |
| 23-corner-mini-player | 23 Corner (mini) player | MISMATCH | 4 |
| 24-youtube-twitch-netflix-hand-off | 24 YouTube / Twitch / Netflix hand-off | VERIFIED (design is an annotation) | 0 |
| 14-player-playing-shader | 14 Player: playing (shader look) | copy VERIFIED | 0 |

## Common ground (checked once, true on every screen unless noted)

Palette (`ui/Theme.kt:24-38`): ink `#05060A`, inkRaised `#0C0E15`, text `#F5F5F7`, textSecondary `#EBEBF5` at 70%, textTertiary at 45%, hairline white 18%, glass white 8%, blue `#0A84FF`, green `#30D158`, orange `#FF9F0A`, red `#FF453A`, purple `#BF5AF2`, teal `#40C8E0`. All hex and alpha values used in the designs match.

Type (`ui/Theme.kt:71-80`), px = 2 x sp: clock 312 Thin, hero 88/100, headline 68/80, title 56/68, dateLine 52, body 44/64, callout 36/48, caption 30/40, eyebrow 28 with 0.14 em. All match, including letter spacings.

Glass panel (`ui/Components.kt:46-64`): radius 32 dp = 64 px, fill white 8% plus a white 5% to transparent gradient, 1 dp (2 px) border from hairline to white 5%. Matches. The first screens approximate the vertical border gradient with four border colours (top .18, sides .115, bottom .05); screens 6 and later use a masked gradient that is exact. Focused glass uses 14% fill and a bottom border of 22% (`Components.kt:55,59`), matched on screens 10, 11 and 12. Focus ring (`Components.kt:144-174`): 3 dp ring 4 dp outside = 6 px outline with 8 px offset, matched everywhere; the lifts 1.02 (panels, sheet rows), 1.04 (toolbar) and 1.06 (tiles) match their call sites.

Aurora (`ui/Aurora.kt:85-89`): fields at 78%/12% radius 55% of width at 30% (1056 px), 12%/95% radius 50% at 14% (960 px), 40%/55% radius 40% at 8% (768 px), vignette radius 0.75 of the larger side (1440 px) to ink 65%. The designs match, with the scene tint (blue, green, orange) in the first field.

Layout origin: safe area 48 x 27 dp (96 x 54 px), scene inset 44 dp (scene top y 142 px), status pill at the top right (`ui/TvdashScreen.kt:72,97`). All match.

## Screens: home canvas

### 1 App frame: aurora backdrop + scene transition

VERIFIED. Aurora numbers (above), safe-area guides (96..1824, 54..1026, scene from 142), status pill `Connected` (padding 28 x 14 px, 16 px dot, 16 px gap, caption textSecondary), 1200 ms tint change, enter and exit transition values (`ui/TvdashScreen.kt:105-108`: 450 ms fade after 120 ms, scale 0.94, slide 1/20, exit 220 ms and 1.03 over 260 ms) and the layer order text all match. The annotation copy is design text, not app copy. No mismatches.

### 2 Connection status pill

VERIFIED. Labels `Connecting…`, `Connected`, `Reconnecting…`, `Demo` and dot colours (textTertiary, green, orange, blue) match `Connection` (`ui/Components.kt:66-71`); dot 8 dp, gap 8 dp, padding 14 x 7 dp, caption in textSecondary match `Components.kt:83-91`. The pulse range 0.35 to 1 over 900 ms (`Components.kt:78`) is shown mid-pulse as opacity .68. No placeholders.

### 3 Idle, empty home

VERIFIED. Copy: the `Ask Claude to put something on this screen` line (`ui/TvdashScreen.kt:137`), `Recent`, the nine toolbar labels, `Card`, `Link`, `Play media`, `Cleared` (`ui/Format.kt:45-50`), `just now`, `12 min ago`, `3 h ago`, `yesterday` (`Format.kt:21-29`). Clock 312 Thin `HH:mm`, date pattern `EEEE, d MMMM` (`Format.kt:10,18`), column padding start 8 dp and bottom 24 dp, gaps 18 dp and 20 dp (`TvdashScreen.kt:132-143`), Browse the web focused, Up next and The wall disabled at 0.4, feed width 340 dp, padding 28 dp, gap 18 dp, dot 8 dp at top padding 7 dp, dot colours green, blue, textTertiary (`ui/ActivityFeed.kt:28-52`) all match.

PLACEHOLDER: the clock `09:41`, the date `Wednesday, 28 October`, the four feed summaries (`Deploy finished: tvdash v0.9.2`, `github.com/wasteer/tvdash/pull/1284`, `Lofi beats to review PRs to`, `Screen cleared`), their times. The summary width of 496 px is a layout choice of the design (the real width is what is left in the panel, 524 px).

### 4 Home with rows

VERIFIED. Toolbar padding (start 8 dp, bottom 18 dp), header height 110 dp (220 px), headline 68/80 with 2 lines, detail line in callout textSecondary, clock hero and date caption, row spacing 22 dp, list padding top 12 dp, row title in callout with start padding 8 dp, 12 dp to the tiles, tile gap 18 dp, tile padding 10 dp, tile 208 x 117 dp, radius 14 dp, title padding 14 dp sides and 16 dp bottom, 2 line clamp, 4 dp progress bar white 20% track with blue fill, focus ring and lift 1.06 all match `ui/Home.kt:123-282`. Row titles `Pins`, `Continue watching`, tile `The wall: 3 pins` (`pinCount` wording) and the detail format `23:10 of 48:00 · from your browser` match `Home.kt:53-69`. Toolbar states (Up next disabled with an empty queue, The wall enabled with pins) are right. Tile grounds `#233150`, `#2A3B2F`, `#3B2A35`, `#2E2A3B` are in the code's list (`Home.kt:86`).

PLACEHOLDER: the focused title `How tvdash renders at 10 feet`, the tile titles, the progress fractions (48%, 12%, 73%), the `09:41` clock, the three pin pictures (drawn as gradients and rectangles; the real ones are JPEGs from the hub, `PinPicture`), and which ground colour each tile gets (the code picks by `url.hashCode()`, `Home.kt:259`, so the design's assignment is arbitrary).

### 5 Toolbar (all button states)

VERIFIED. Order and labels, pill padding 18 x 11 dp, glyph 20 dp, gap 10 dp, 12 dp between buttons, 6 dp padding, focused fill `#F5F5F7` with ink label, disabled alpha .4, badge (blue pill, padding 8 x 1 dp, caption, white) match `ui/Toolbar.kt:53-118`. The glyph paths match `drawGlyph` (`Toolbar.kt:121-163`): viewBox 100, stroke 10, round caps and joins, same coordinates. PLACEHOLDER: badge counts `2` and `3`.

### 6 Home tile actions sheet

MISMATCH (2). Verified here: scrim black 55%, sheet 340 dp wide, 48 dp from the right, padding 24 dp, gaps 10 dp, title in `title`, row radius 12 dp, row padding 18 x 14 dp, focused row `#F5F5F7` with ink label and lift 1.02, copy `Play from the start`, `Add to Up next`, `Send back to laptop`, `Remove` (`ui/ActionSheet.kt:40-45,88-133`).

Mismatches (the screen behind the sheet):

1. The toolbar behind the sheet has 5 buttons (Home, Browse the web, Bookmarks, History, Voice). The code always draws 9 (`ui/Toolbar.kt:53-63`; Up next and The wall are dimmed, not removed, and Refresh and Pair a device are always present).
2. Those glyphs are different drawings: a 24 unit viewBox with stroke 2 (8.3%) and other shapes (for example the house `M3 11l9-7 9 7M5 10v10h14V10`), where the code uses a 100 unit viewBox, stroke 10% and the paths in `Toolbar.kt:121-163`.

PLACEHOLDER: the title `Kotlin Conf keynote`, tile titles `Compose for TV deep dive` and `Release walkthrough`, progress 48% and 21%, clock `21:47`, date `Friday, 6 November`.

### 7 Card: info

MISMATCH (1). Verified: panel width 1440 px (max 720 dp), padding 80 px, glyph disc 96 px at accent 18%, glyph box 48 px, stroke 6 px (13% of 48 is 6.2), gap 32 px to the `INFO` eyebrow in accent, title hero 88/100 with top gap 56 px, body 44/64 textSecondary with gap 28 px, footer `From Claude · just now` in caption textTertiary with gap 64 px, blue aurora tint (`ui/TvdashScreen.kt:149-173`, `ui/Components.kt:95-129`).

Mismatch: the "i" glyph geometry. Design: dot at y 12 and bar from y 21 to 35 in a 48 box. Code (`Components.kt:120-123`, w = 48 px): dot centre y 6.7 (0.14 w), dot radius 3.9, bar from y 20.2 to 43.2 (0.42 w to 0.90 w).

PLACEHOLDER: title `The hub moved to a new address`, body text, host `hub.home.lan`, the time.

### 8 Card: success

MISMATCH (1). Same checks as screen 7 pass (green accent, `SUCCESS`, green tint). Mismatch: the check mark path. Design `M12 25l8 8 16-17` (points 12,25 / 20,33 / 36,16). Code (`Components.kt:107-115`, w = 48): 5.8,25 / 19.2,38.4 / 43.2,10.6. PLACEHOLDER: `Deploy finished`, the body (`tvdash 1.4.2`, `214 checks`, `two seconds`), `From Claude · 4 min ago`.

### 9 Card: warning

MISMATCH (1). Same checks pass (orange accent, `WARNING`, orange tint). Mismatch: the "!" glyph. Design: bar from y 12 to 26 and dot at y 35. Code (`Components.kt:116-119`): bar from y 4.8 to 28.8 (0.10 w to 0.60 w), dot centre y 42.2 (0.88 w) with radius 3.9. PLACEHOLDER: `Disk almost full on the hub`, the body (`94%`, pin pictures), `From Claude · 12 min ago`.

### 10 Link card with QR code

VERIFIED. Panel 1640 px (max 820 dp), padding 80 px, focused glass (14% fill, ring 6 px, lift 1.02), host in callout blue, hero title with gap 40 px, note in body textSecondary with gap 28 px, footer gap 56 px, 80 px between the columns, QR tile white, radius 40 px, padding 28 px, code 368 px in `#0B0B0F`, gap 28 px, `Scan to open on your phone` (textSecondary) and `Press OK to open here` (textTertiary) match `ui/TvdashScreen.kt:176-211` and `ui/Qr.kt:38-53`. The QR is 25 modules (version 2), which is plausible for the URL. PLACEHOLDER: host `developer.android.com`, title `Compose for TV: focus and navigation`, note text, the QR modules (not decoded here), `From Claude · just now`.

### 11 GitHub PR / issue card

MISMATCH (1). Verified: panel 1720 px (max 860 dp), QR 160 dp (320 px), state chip (green 16% fill, padding 28 x 12 px, 16 px dot, 16 px gap, `Open` in callout), `Pull request` in textSecondary, 24 px between them, repo line with 40 px gap, headline title 68/80 with 12 px gap, byline `by yab · shared 6 min ago` with 20 px gap, a 48 px gap to the checks and diff row with 56 px between them, `12 passed` (green) and `1 running` (orange) in this order with zero `failed` left out, diff `+482` in green and `−117` (real minus) in red, five 24 px blocks with radius 6 px and 6 px gaps, 4 green and 1 red (`diffBlocks`: round(5 x 482 / 599) = 4), note gap 44 px, green aurora tint (`ui/Github.kt:36-160`).

Mismatch: the gap between a check dot and its text is 20 px in the design (`.ck span{gap:20px}`); the code uses 8 dp = 16 px (`Github.kt:137`).

PLACEHOLDER: `yab/tvdash #1291`, the title, author `yab`, `6 min ago`, the counts 12, 1, 482, 117, the note `Ready for a look on the TV before merging.`, the QR modules.

### 12 Media scene drawn as a link card

VERIFIED. Same as screen 10 (width 1640 px, focused, blue tint, QR 368 px, no note). PLACEHOLDER: host `media.example.com`, title `Kotlin Conf keynote`, `From Claude · 38 min ago`, QR modules.

### Shader look variants (screens 3, 7, 8, 9, 10, 11)

Each variant was text-diffed against its original: every visible string is identical (no missing or extra copy). The only colour differences are decorative and have no counterpart in the code: the focused toolbar fill is a `#FFFFFF` to `#E4E6EE` gradient on the idle shader (code `Palette.text` `#F5F5F7`, `ui/Toolbar.kt:103`), the card glyph strokes are lightened (`#5CB0FF`, `#7DF0A0`, `#FFC56B` instead of the accents), and the backdrop is a generated shader instead of the `#0C0E15` gradient plus radial fields. The shader looks are therefore a stylistic alternative, not a representation of the Kotlin app.

## Screens: player canvas

Common player checks, all matching `player/PlayerScreen.kt:350-427`: bottom scrim 520 px (260 dp) transparent to black 78%; bottom column padding 128 px sides and 78 px top and bottom; title in `title`, one line with ellipsis; 48 px (24 dp) before the hint; hint in caption textTertiary; 32 px (16 dp) to the bar; progress area 40 px, track 16 px with radius 8 px, white 22%, blue fill, 40 px white knob centred on the position; 20 px (10 dp) to the times; times in caption textSecondary. The hint text is exactly `OK pause · ◀ ▶ 10 s, hold to scrub · ▲ browse · Back twice to leave` while playing and `OK play · ◀ ▶ …` otherwise. The video area is a gradient with a `video frame` label in every screen: a stand-in for the video, not in the code.

### 13 Player, full screen: loading / buffering

VERIFIED. Spinner 112 px with a 104 px arc (code offset 4 px), stroke 6 px (written in px, `PlayerScreen.kt:497`), white 90%, 270 degrees (dash 245 of 327), round cap (the design shows a static frame; the code turns once per 900 ms). Hint reads `OK play` because the player is not playing. PLACEHOLDER: `Big Buck Bunny`, `4:12` and `-6:22` (39.7%, consistent with a 10:34 length).

### 14 Player: playing (controls overlay, auto-hide)

VERIFIED. No centre glyph, hint `OK pause`. PLACEHOLDER: title and times. The 4 s auto-hide (`OVERLAY_HIDE_MS`, `PlayerScreen.kt:96`) cannot be seen in a still.

### 15 Player: paused

VERIFIED. Paused disc 224 px (112 dp) black 45%, triangle 80 px (40 dp) white with points (17.6,6.4), (73.6,40), (17.6,73.6), which is `0.22 w / 0.08 w`, `0.92 w / 0.5 w`, `0.22 w / 0.92 w` (`PlayerScreen.kt:468-487`). PLACEHOLDER: title and times.

### 16 Player: live stream

VERIFIED. No bar or times; `LIVE` badge red `#FF453A`, radius 12 px (6 dp), padding 20 x 6 px (10 x 3 dp), `eyebrow` white, 24 px (12 dp) before the host in caption textSecondary (`PlayerScreen.kt:398-404`). PLACEHOLDER: `Lo-fi beats radio`, host `stream.example.com`.

### 17 Player: "Press Back again to leave"

VERIFIED. The hint is replaced by `Press Back again to leave` in callout (36/48) and `text` colour `#F5F5F7` (`PlayerScreen.kt:382-383`). PLACEHOLDER: title and times.

### 18 Player: Up next line and end countdown

VERIFIED for what is drawn: the line `▼ Up next: Sintel` in callout textSecondary, 20 px (10 dp) below the title row, one line with ellipsis (`PlayerScreen.kt:392-395`, `PlayerLogic.kt:35`). The end countdown form `Up next in N s: <title>` (shown in the last 15 s of a playing video, `PlayerLogic.kt:15,32-33`) is named in the screen title but not drawn, so it is not verified. PLACEHOLDER: `Sintel`.

### 19 Player: error ("Can't play this video")

VERIFIED. `Can't play this video` in title, 16 px (8 dp) gap, the error line in caption textSecondary in the form `<ERROR_CODE_NAME>: <message>` (`PlayerScreen.kt:115`), 24 px (12 dp) gap, choices in callout `text`: `OK try again · Back to return` (the variant without a source page, `PlayerScreen.kt:515-516`). The `OK try again · ▼ open the page instead · Back to return` variant is not drawn. Hint reads `OK play`. PLACEHOLDER: the error text `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED: Unable to connect to cdn.example.com` (a real error name, but the message and host are invented).

### 20 Player: ended

VERIFIED. Bar full, times `10:34` and `-0:00` (format `-` plus `playbackTime(duration - position)`), no centre glyph, hint `OK play`. The darker video (brightness .6) and the label `last frame` are design stand-ins. PLACEHOLDER: title and times.

### 21 Player actions sheet

VERIFIED. Same sheet metrics as screen 6; title is the media title; options `Browse while it plays`, `Send back to laptop`, `Start over` in this order (`PlayerScreen.kt:321-331`); first row focused; sheet over the visible overlay. PLACEHOLDER: `Big Buck Bunny`, times.

### 22 Up next tray

MISMATCH (1). Verified: scrim 600 px (300 dp) to black 85%, padding 108 px sides and 66 px (33 dp) vertical, 28 px (14 dp) gap, `Up next` in title and `OK plays it now · ▲ back to the video` in caption textTertiary 32 px (16 dp) apart, tiles 416 x 234 px with gap 36 px and padding 20 px, first tile focused with lift 1.06, no progress bars, no controls overlay behind (`PlayerScreen.kt:430-466`).

Mismatch: the hint has `padding-bottom:6px` in the design; the code has none (the row is bottom-aligned, `PlayerScreen.kt:449-452`).

PLACEHOLDER: tile titles `Sintel`, `Tears of Steel`, `Elephants Dream`; tile grounds (hash based in code).

### 23 Corner (mini) player

MISMATCH (4). Verified: mini box 640 x 360 px (320 x 180 dp), 96 px from the right, 54 px from the bottom, radius 32 px (16 dp), caption `▶ Play for full screen` in caption textSecondary right-aligned at 120 px from the right and 430 px from the bottom (`ui/Browser.kt:250-296`, 60 dp and 215 dp), no overlay on the mini video. The home behind it: toolbar (without badge; Up next and The wall dimmed), header, clock and date, rows `Continue watching` and `Sent to the TV`, tile sizes and progress bars, aurora fields at their pixel positions.

Mismatches:

1. Toolbar glyphs are other drawings (40 unit viewBox, stroke 3.5, other shapes) than `drawGlyph` (`ui/Toolbar.kt:121-163`, stroke 10%).
2. Tile titles that sit on tiles with a progress bar use `bottom:40px`; the code uses 16 dp = 32 px for every tile (`ui/Home.kt:275`).
3. The tile rows start 20 px (10 dp) too high: tiles at y 610 and 1000, where title (48 px), 24 px gap and 20 px list padding (`Home.kt:140-145,198`) put them at 630 and 1020.
4. The 2 px white 6% ring around the mini video (`box-shadow`) has no counterpart: the code only clips to radius 16 dp (`Browser.kt:256-259`).

PLACEHOLDER: `Tears of Steel`, `Sintel`, `Elephants Dream`, `example.com`, progress 48%, 22%, 71%, clock `21:42`, date `Friday, 6 November`, the `video frame` label.

### 24 YouTube / Twitch / Netflix hand-off

VERIFIED against the inventory: the TV draws no UI of its own (`ui/Browser.kt:127`, `apps/AppLaunch.kt:30`). The screen shows only an annotation, `Streaming app in front` and `YouTube (SmartTube) · Twitch · Netflix — tvdash draws no UI of its own for a hand-off`; this is design commentary, not app copy.

### 14 (shader look): Player: playing

Copy VERIFIED: identical text to screen 14. Decorative differences only: a generated shader video stand-in with `#5E5CE6`, `#64B5FF`, `#E7EFFF`, `#9CC6FF` instead of the `#1F2C4A` to `#0D1220` gradient; none of these exist in the code.

## Unclear or not verifiable

- Clock line height: the design uses 1.2 for the 312 px clock; the code sets no `lineHeight` for `Type.clock` (`ui/Theme.kt:71`), so the real value depends on the font metrics. Not checked on a device.
- Card panel width (screens 7, 8, 9): the design fixes 1440 px; the code uses `widthIn(max = 720.dp)`, so a short card is narrower than drawn (`ui/TvdashScreen.kt:153`). Same for the link and GitHub panels (820 and 860 dp).
- Screen 6: the design draws a focus ring on the home tile under the scrim. The code sets `canFocus = inFront`, false while the sheet is open (`ui/Home.kt:109`), so the ring is probably absent; needs a device to confirm.
- Screen 18: the end countdown copy `Up next in N s: …` and screen 19: the `▼ open the page instead` choices are in the code but not drawn.
- QR modules (screens 10, 11, 12 and shader variants) are sample patterns; whether they decode to the sample URL was not tested.
- Tile ground colours: the code chooses by `url.hashCode()`; the design's colour per tile cannot be reproduced without running it.
- Animated values (spinner turn, pulse, scene transition, 4 s overlay hide) are described in the designs as text or as one frame; their timing was checked only against the code constants.
- Glass border: screens 1 to 5 and 10 to 11 use a four-colour approximation of the vertical gradient border; visually close but not identical to `Components.kt:57-60`.
- Inter and Inter Display font files were not compared with `res/font/`; only the weights named in `Theme.kt` were checked.
- The shader looks use values that have no code counterpart; there is nothing to verify them against.
