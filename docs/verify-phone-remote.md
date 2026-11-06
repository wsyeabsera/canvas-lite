---
sidebar_position: 32
slug: /verify-phone-remote
---

# Verification of the phone remote canvas (#1971)

This page checks every screen of the Lite canvas `tvdash-phone-remote` (project `tvdash`, 33 screens) against the code that draws it. Nothing on the Worker or in the tvdash repo was changed.

**Canvas:** fetched with its html on 2026-11-06. Screen ids `s01` to `s31`, `s01b` and `s05-shader`.

**Code compared against** (all in `/Users/yab/Hobby/tvdash/hub/src`): `remote.html` (page, CSS lines 20 to 447, script 755 to 2265), `oauth.ts` (the `/authorize` page), `remote.ts` (manifest, share target, Shortcut file name), `icon.ts` (app icon). For copy that the hub supplies (not the page) also `media.ts`, `screen.ts`, `mcp.ts`, `card.ts` and `hub/scripts/shortcut.mjs`. The inventory in `docs/tvdash-phone-screens.md` was used as a map, not as proof: where it and the code differ, the code wins.

**How it was checked.** Every visible string and every colour of each screen was extracted by script and searched in the sources (strings that are not in the sources are sample data or hub output and were then checked by hand). Sizes, radii, spacing and layout were compared with the CSS rule by rule.

## How to read the verdicts

- **VERIFIED**: copy, colours and sizes match the code; only sample data and the shared shell notes below apply.
- **MISMATCH**: at least one value in the design differs from the code. Each is listed as design value versus code value with `path:line`.
- **Placeholder** values are sample data in the design that the code does not define (titles, hosts, times, ids, counts). They appear in the per-screen sections, never in the mismatch count.
- The mismatch count is for that screen only. Findings that repeat on many screens are listed once as shared findings (`S1` to `S7`) and are not added to each screen's count.

## Summary

| Screen | Name | Verdict | Mismatches |
| --- | --- | --- | --- |
| s01 | Shell, header, connection pill | VERIFIED (shell notes) | 0 |
| s02 | Can't reach the hub banner | MISMATCH | 1 |
| s03 | Pair panel (unpaired) | MISMATCH | 2 |
| s04 | QR pairing | VERIFIED | 0 |
| s05 | Now playing, scene states | MISMATCH | 1 |
| s06 | Now playing, player states and controls | MISMATCH | 4 |
| s07 | Now playing, live stream | MISMATCH | 3 |
| s08 | Now playing, offline and stale | MISMATCH | 4 |
| s09 | Phone lock screen and control centre | MISMATCH | 2 |
| s10 | D-pad | MISMATCH | 1 |
| s11 | Volume row | MISMATCH | 2 |
| s12 | TV browser panel | MISMATCH | 5 |
| s13 | Address suggestions | MISMATCH | 4 |
| s14 | Touchpad panel | MISMATCH | 1 |
| s15 | Touchpad keyboard form | MISMATCH | 3 |
| s16 | Bookmark what's on the TV | MISMATCH | 1 |
| s17 | History and bookmarks panel | MISMATCH | 5 |
| s18 | Library panel | MISMATCH | 4 |
| s19 | Send to TV form and result | MISMATCH | 6 |
| s20 | Share-sheet setup | MISMATCH | 2 |
| s21 | Arrival from the Android share sheet | MISMATCH | 5 |
| s22 | Type on the TV panel | MISMATCH | 1 |
| s23 | Up next panel | MISMATCH | 6 |
| s24 | Recent activity panel | MISMATCH | 4 |
| s25 | Bottom tab bar | VERIFIED (shell notes) | 0 |
| s26 | Keyboard bar | MISMATCH | 3 |
| s27 | Toast | VERIFIED | 0 |
| s28 | Installed web app (manifest and icon) | MISMATCH | 4 |
| s29 | iPhone Play on TV Shortcut | MISMATCH | 1 |
| s30 | Claude sign-in, default | MISMATCH | 3 |
| s31 | Claude sign-in, error | MISMATCH | 3 |
| s01b | Desktop two-column layout | MISMATCH | 3 |
| s05-shader | Scene states (shader look) | MISMATCH (design-only variant) | 6 |

Totals: 4 VERIFIED, 29 MISMATCH. 29 of the 33 screens carry sample data that the code does not define (listed per screen); 90 screen-specific mismatches in all.

## Shared findings (apply to most remote frames)

- **S1, connection pill gap.** Design `gap:8px` between dot and text; code `gap:7px` (`remote.html:81`). Dot size 8 px, glow `0 0 10px rgba(48,209,88,.7)`, colours of the four states match (`:86-90`).
- **S2, brand mark glyph.** Design draws a plain triangle `M12 9v14l11-7z`; code draws a rounded-corner path in the same 32 px, radius 9 tile with the same `#0A84FF` to `#5E5CE6` gradient (`remote.html:452` and `:485`). Tile, gradient and size match; only the glyph outline differs.
- **S3, tab bar.** Design top border `rgba(255,255,255,.10)`, code `1px solid var(--hairline)` which is `rgba(255,255,255,0.18)` (`:431-432`, `:25`). Design side padding 4 px, code 8 px plus the safe-area insets (`:431`). Design bottom padding 22 px stands in for the home-indicator inset (code `env(safe-area-inset-bottom)`). Labels, order (Remote, Touchpad, Browse, Library, Activity), 11 px / 600, 56 px min height, 3 px gap, active colour `#64B5FF` and inactive `rgba(235,235,245,.38)` match (`:435-437`, `:729-735`).
- **S4, page background glows.** Colours match (`rgba(10,132,255,.22)`, `rgba(94,92,230,.20)`, `rgba(191,90,242,.12)` at the same anchor points). Geometry differs: design `circle ... transparent 50%`, code ellipses `60vmax 50vmax`, `55vmax 45vmax`, `50vmax 40vmax` fading at 62%, 60%, 60% (`:59-62`). The design cannot use vmax inside a fixed frame, so this is an approximation.
- **S5, D-pad key position.** Code puts the four arrow keys flush to the ring (`top:0`, `bottom:0`, `left:0`, `right:0`, 33% size, `:210-213`). Design insets them by 6 px (s01, s02, s03, s04, s06, s07, s08) and by 3 px (s10, s11 frames), so the design is also inconsistent with itself. Centre `OK` key (94 px offset, `#0A84FF`, 17 px / 600, shadow `0 10px 30px rgba(10,132,255,.4)`) matches (`:217`).
- **S6, text field.** Design `.f` uses `gap:10px`, code `.field` uses `gap:8px` (`:273`). Inside a `.send-row` (pair, TV browser address, Send, Type) the code field has `padding-right:16px` (`:287`); the design keeps `6px`. Height 52, radius 16, background `rgba(0,0,0,.28)`, border hairline, 16 px text, focus border `rgba(10,132,255,.8)` and ring `0 0 0 3px rgba(10,132,255,.22)` match (`:272-279`).
- **S7, icons.** Every icon in the design is a hand-redrawn symbol (moon, remote, touchpad, globe, apps, clock, speaker, star, ...) and differs in path geometry from the sprite at `remote.html:454-479`. The design's default icon size is 20 px; the code's `svg.icon` default is 24 px (`:64`), so any icon the design does not size explicitly differs. Treat all icon artwork as indicative, not exact.

Shared items that do match everywhere: panel (`.glass`) fill `rgba(255,255,255,.08)`, border `rgba(255,255,255,.18)`, radius 28, padding 20 (26 on desktop), inner highlight and shadow `0 20px 60px rgba(0,0,0,.35)` (`:108-116`); heading `h2` 13 px / 600 / uppercase / `.06em` / `rgba(235,235,245,.38)` / 14 px below (`:120`); chip (28 px, `0 11px 0 9px`, `rgba(255,255,255,.12)`, 13 px / 600); state dot 7 px, gap 7; art tile 64 px radius 18; title 21 px / 700 / `-.015em` / 1.22; subtitle 14 px `rgba(235,235,245,.64)`; secondary buttons `rgba(255,255,255,.12)` fill with `rgba(255,255,255,.14)` border, radius 14, 15 px / 600 (`:393`); primary button 52 px, radius 16, `#0A84FF`, 16 px / 600, shadow `0 10px 28px rgba(10,132,255,.35)` (`:288-291`). The design omits the backdrop blur (`blur(28px) saturate(150%)`), which cannot be shown on a flat frame.

## Per screen

### s01 Shell, header, connection pill: VERIFIED (shell notes)

- Matches: wrap side padding 16, header margin `4px 2px 16px`, brand 19 px / 700, `remote` 15 px / 500 `rgba(235,235,245,.38)`, pill 30 px high, `Connected` (`remote.html:1142`), chip `Idle` and state `Idle` (`:1150`, `:1197`), title `Nothing on screen`, subtitle `The TV shows its clock`, note `Nothing is playing on the TV. Send a video below and the controls light up.` (`:1219`), note 13.5 px centred, 16 px above (`:248-251`).
- Shared findings: S1, S2, S3, S4, S5, S7.
- Placeholder: top padding 50 px is the status-bar area (code: `14px + safe-area-inset-top`, `:74`). The frame cuts the page below the D-pad: the Back, Menu and play row and the volume row exist in code (`:570-581`) but are off frame.

### s02 Can't reach the hub banner: MISMATCH (1)

- Verified: pill `Hub unreachable` in `#FFB4AE` with border `rgba(255,69,58,.45)` and red dot without glow (`:89-90`); banner text `Can't reach the hub.` plus ` Showing the last known state; retrying in the background.` (`:493`); banner padding `12px 14px`, radius 18, fill `rgba(255,69,58,.12)`, border `rgba(255,69,58,.4)`, text `#FFD3CF`, 14 px, icon 20 px red with 1 px top offset (`:92-98`); state `Offline` and title `Connecting to the hub` (`:1147`, `:1191`).
- MISMATCH 1: after two failed polls the code fades the Now playing card, `.np-main` and `.timeline` to `opacity: 0.5` (`remote.html:1201`, `:261`); the design draws the card at full opacity.
- Placeholder: none beyond the empty-hub state.

### s03 Pair panel (unpaired): MISMATCH (2)

- Verified: heading `Pair this phone with the TV`, note text, placeholder `123 456`, `Pair` button with arrow, TV icon 18 px, pill `Connecting` with grey dot, state `Loading`, title `Connecting to the hub` (`:497-506`, `:1142`).
- MISMATCH 1: panel inset. Code `.pair-panel { margin: 0 16px 16px }` (`:117`) inside the 16 px wrap, so the panel sits 32 px from the screen edge; the design draws it at 16 px.
- MISMATCH 2: `Pair a device` is bold in the code but not recoloured: `.pair-note` is `--text-2` and no rule restyles `strong` there (`:118`), so the bold text is `rgba(235,235,245,.64)`; the design colours it `#F5F5F7` at weight 600 (the recolouring rule exists only for `.share-setup strong`, `:256`).
- Also S6 (field right padding and gap).
- Unclear: the code's first `GET /status` for an unpaired phone answers 401, which counts as a failure; the pill moves to `Reconnecting` and, from the second failure, `Hub unreachable` with the red banner while the pair panel stays (`:879-880`, `:1140`). The design shows the calm `Connecting` state only.
- Placeholder: `123 456` (it is the real placeholder, not a value).

### s04 QR pairing: VERIFIED

- Verified: toast `Paired. This phone is a remote for the TV now.` (`:2227`); toast geometry (radius 16, padding `12px 16px`, 14 px / 500, fill `rgba(28,28,32,.86)`, border hairline, shadow `0 16px 40px rgba(0,0,0,.5)`, 84 px above the bottom on a phone, max width 358 = viewport minus 32, `:395-406`, `:438`); success icon `#30D158`. The pair panel is hidden after pairing, as drawn.
- Shared findings: S1, S2, S3, S4, S5.

### s05 Now playing, scene states: MISMATCH (1)

- Verified (copy and logic from `describe()` `:1146-1168`, tones `:131-134`, art `:143-146`): idle `Idle` / `Nothing on screen` / `The TV shows its clock`; card chip `Card` with title and body as subtitle; link chip `Link`, title falls back to `repo #number`, subtitle host; TV browser chip `Browser`, subtitle `host · in the TV's browser`; player chip `Player` state `Playing` green; app chip `YouTube app` state `Handed off` blue (`#64B5FF`, dot `#0A84FF`); unknown type shows its type name as chip and `Something new on screen`. Art gradients: card and link `#F59E0B` to `#EA580C` with shadow `rgba(245,158,11,.2)`; browser `#0FA3B1` to `#2563EB` (`.25`); player `#1B5FD9` to `#5E5CE6` (`.3`); app `#E0245E` to `#8E44AD` (`.25`).
- MISMATCH 1: header bottom margin `12px` in this frame; code `16px` (`:76`). Other frames in the canvas use 16.
- Placeholder: the small caps labels (`no data yet`, `idle`, `card`, `link`, `TV browser page`, `media, player`, `media, app`, `any other type (for example steps)`) are annotations; the frame height 1760 is a stacked specimen sheet. Sample data: `Build finished`, `All 214 tests passed`, `wsyeabsera/tvdash #12`, `github.com`, `Hacker News`, `news.ycombinator.com`, `Big Buck Bunny`, `download.blender.org`, `Lo-fi beats to relax to`, `youtube.com`.
- Note: the code's page title for an app scene is `Lo-fi beats to relax to · tvdash`; for the subtitle it is `youtube.com · in the YouTube app` (`:1160`), which matches.

### s06 Now playing, player states and controls: MISMATCH (4)

- Verified: chip `Player`, state `Playing` green, timeline margin 20, track 6 px radius 3 with fill `#F5F5F7` and rest `rgba(255,255,255,.18)`, thumb 20 px white with shadow `0 2px 10px rgba(0,0,0,.45)` (`:153-169`), times 13 px / 500 tabular, controls 64 px, 84 px play-pause `#0A84FF` with shadow `0 12px 36px rgba(10,132,255,.45)`, icons 30 and 36 px, Stop pill (44 px, `rgba(255,69,58,.14)`, border `.36`, `#FF6961`, 15 px / 600, icon 16 px, `:241-246`), `Stop` label, foot divider `rgba(255,255,255,.08)`, 12.5 px `rgba(235,235,245,.38)`, clock icon 14 px, text `Reported 3s ago` (`:1259`).
- MISMATCH 1: control border `rgba(255,255,255,.14)`; code `.ctl` uses `var(--hairline)`, `.18` (`:186`).
- MISMATCH 2: foot top margin `14px`; code `18px` (`:263`).
- MISMATCH 3: the forward button is the back glyph mirrored with `scaleX(-1)`, which mirrors the `10` label; code uses a separate `i-fwd` symbol with an unmirrored label (`:459`, `:544`). Label baseline `y=15` versus `y=14.6`.
- MISMATCH 4: design has no gap above the times row; code `.times { margin-top: 2px }` (`:173`).
- Control gap: design 28 px, code `clamp(18px, 7vw, 36px)` = 27.3 px at 390 px (`:183`), a rounding difference only.
- Placeholder: `Big Buck Bunny`, `download.blender.org`, `1:32` and `−3:41` (29 % fill), `3s`.

### s07 Now playing, live stream: MISMATCH (3)

- Verified: `LIVE` badge (22 px high, `0 9px`, radius 6, `#FF453A`, 11 px / 700, `.08em`, 6 px white dot, `:174-178`), times row 36 px with no range and no remaining (`:179-181`), seek buttons dimmed to 0.32 (`:196`), note `Live stream: seeking is off.` (`:1225`), the note sitting between Stop and the foot.
- MISMATCH: same three as s06: control border `.14` versus `.18`, foot margin 14 versus 18, mirrored forward glyph.
- Placeholder: `Evening news, live`, `stream.example.tv`, `12:07`, `2s`.

### s08 Now playing, offline and stale: MISMATCH (4)

- Verified: pill and banner as in s02, state `Last known: Playing` in orange (`:1199`), card main row and timeline at opacity 0.5 (`:261`), foot `Last report 2m ago. Is the TV on?` in `#FF9F0A` (`:1259`, `:267`).
- MISMATCH: control border `.14`, foot margin 14 versus 18, mirrored forward glyph (as s06), and the art tile has no shadow whereas the code keeps `0 10px 30px rgba(10,132,255,.3)` and only fades it with the row (`:139`, `:261`).
- Placeholder: `Big Buck Bunny`, `download.blender.org`, `1:32`, `−3:41`, `2m`.

### s09 Phone lock screen and control centre: MISMATCH (2)

- This frame illustrates the operating system's media UI; iOS and Android draw it, so its colours, type and layout (date `Friday 6 November`, clock `9:41`, 88 px time, blurred card, 5 px scrubber) are not defined by the code and cannot be verified. The code supplies only the metadata (`remote.html:1457-1462`): title, artist, album `tvdash`, artwork `/remote/icon-180.png`, and the handlers play, pause, seek back, seek forward, seek to (`:1426-1432`), all ending in `POST /control`. The design's annotation about these is correct.
- MISMATCH 1: the design shows the artist line `On the TV` for a player scene. The code sets `artist: d.sub || 'On the TV'` (`:1459`), and for a player scene the subtitle is the host (`download.blender.org`), so `On the TV` only appears when the subtitle is empty.
- MISMATCH 2: the artwork is drawn as the blue-violet gradient tile; the real artwork is the app icon (dark tile with glass screen and blue play triangle, `icon.ts:10-21`).
- Placeholder: `Big Buck Bunny`, `1:32`, `−3:41`, date and clock.

### s10 D-pad: MISMATCH (1)

- Verified: heading `Remote`, ring 280 px (`min(280px, 78vw)`), fill `rgba(255,255,255,.12)`, border hairline, key rotations, row `Back`, `Menu`, play (3 columns, gap 10, 16 px above, `:225`), volume row grid `48px 48px 1fr 48px`, gap 10, 14 px above (`:220`), `−` and `+` labels, 22 px glyphs (`:221`).
- MISMATCH 1: volume `−` and `+` are weight 500; code keeps the `.secondary` weight 600 (`:393`, `:221`).
- Also S5 (keys inset 3 px here). Pad-row buttons use `padding: 0 10px` and gap 6 in code (`:226`) versus `0 16px` and gap 8; invisible at these widths.
- Placeholder: slider thumb at 19 %.

### s11 Volume row: MISMATCH (2)

- Verified: muted state is orange with border `rgba(255,159,10,.5)` (`:223`); unknown state fades the slider to 0.4 (`:224`); unmuted shows the level on the slider. The speaker-off icon is a crossed speaker in code (`i-speaker-off`, `:469`, `:2128`).
- MISMATCH 1: `−` and `+` weight 500 versus 600 (as s10).
- MISMATCH 2: the unknown row draws the thumb at 19 %; the code starts at `value="0"` and sets the fill only when the TV has reported a level, so an unknown row shows the thumb at 0 (`:579`, `:2119-2124`).
- Placeholder: level 19, and the three caption lines (annotations, not in code).

### s12 TV browser panel: MISMATCH (5)

- Verified: heading `TV browser`; actions `Bookmark`, `Open here`, `Play video` (3 columns, gap 8, 40 px high, 13.5 px, icon 14 px, `:353-355`); placeholder `Search or address`; `Go` with arrow; `Back`, `Forward`, `Reload`; switch row `Mouse mode` with text `The arrows move a pointer instead of jumping between links` (12.5 px, `:615`); knob 51 × 31 with 27 px thumb and shadow `0 2px 6px rgba(0,0,0,.3)` (`:349-352`); tabs `Bookmarks` and `History` (3 px padding, radius 14 and 11, 38 px, `:384-386`); heading `History & bookmarks`.
- MISMATCH 1: page-title row bottom margin 12 versus 14 (`:336`).
- MISMATCH 2: page title is bold (600) in the design; code title is a plain span at the inherited weight 400 (`:339`).
- MISMATCH 3: actions row bottom margin 12 versus 14 (`:353`).
- MISMATCH 4: Back, Forward, Reload row top margin 12 versus 16 (`:225`).
- MISMATCH 5: switch divider padding: design 14 px under the line, code `padding: 8px 0 0` (`:344`).
- Also S6. Not drawn: the suggestions list gap, and the page row is hidden in code until the TV reports a page.
- Placeholder: `Hacker News`, `news.ycombinator.com`.

### s13 Address suggestions: MISMATCH (4)

- Verified: focused field ring (`:276`), typed text `hack` (sample), rows min height 52, gap 12, URL line 12.5 px `rgba(235,235,245,.38)` (`:233-240`), bookmarks listed before history, at most five rows (`:1845`).
- MISMATCH 1: list top margin 10 versus 6 (`:230`).
- MISMATCH 2: the design draws a top border and 10 px padding on every row including the first; code removes the first row's border and uses 0 padding on `li` with 6 px inside the button (`:310-311`, `:232-233`).
- MISMATCH 3: row titles are weight 500 in the design; code has no weight rule, so 400 (`:239`).
- MISMATCH 4: the bookmark star is `#64B5FF`; code icon tiles use `--text-2` `rgba(235,235,245,.64)` (`:312`).
- Placeholder: `hack`, `Hacker News`, `Hackaday`, `hackaday.com`, `Show HN: a TV remote in a Worker`, `news.ycombinator.com/item?id=41234567`.

### s14 Touchpad panel: MISMATCH (1)

- Verified: heading `Touchpad` and state `Ready` in green (12.5 px, `:381-382`, `:1965`), hint `Drag to move · tap to click · two fingers to scroll` (`:1656`), surface radius 22, fill `rgba(0,0,0,.28)`, hairline border, hint 12.5 px at 14 px from the bottom (`:358-362`), buttons row `1fr 1.25fr 52px 52px`, gap 8, top 12 (`:368`), `Back`, `Forward`, icon-only Reload and Keyboard (48 px), bookmark row `Bookmark Hacker News` (`:1766`), min height 48, 8 px above.
- MISMATCH 1: the bookmark label is left-aligned in the design; code centres it (`:373`).
- Assumption: surface height 416 px equals `100dvh - 350px - env(safe-area-inset-*)` for an 844 px screen with roughly 78 px of insets (`:441`); plausible, not exact.
- Placeholder: `Hacker News`.

### s15 Touchpad keyboard form: MISMATCH (3)

- Verified: keyboard button in the open state, border `rgba(10,132,255,.8)` and `#64B5FF` (`:372`); placeholder `Type into the TV`; buttons `Type` and `Enter` with arrow; the form's field focus ring.
- MISMATCH 1: element order. Code order is touch row, then the bookmark row, then the typing form (`remote.html:629-647`); the design puts the typing form between the buttons and the bookmark row.
- MISMATCH 2: the `Enter` button is 48 px high with radius 14 and 15 px text in the design; in code it is the primary button (52 px, radius 16, 16 px, padding 0 22 px, `:288`).
- MISMATCH 3: `Type` is min 48 px in the design; code `.secondary` is min 44 px (`:393`), stretched by the row only if the neighbour is taller.
- Note: the design shrinks the touchpad to 150 px for the form; in code the surface keeps its height and the form is added below it.
- Placeholder: the shortened pad height; `Hacker News`.

### s16 Bookmark what's on the TV: MISMATCH (1)

- Verified: the three labels `Nothing to bookmark on the TV`, `Bookmark Hacker News` (`Bookmark` plus the page title), `Bookmarked, tap to remove` (`:1766`); the saved state border `rgba(10,132,255,.8)`, text and filled star `#64B5FF` (`:375-376`); toasts `Bookmarked` and `Bookmark removed` (`:1772`).
- MISMATCH 1: the disabled row is drawn at opacity 0.4; code has no disabled style for `.secondary` or `.touch-bookmark` (only `:disabled { cursor: not-allowed }`, `:68`, plus rules for `.ctl`, `.stop` and range inputs), so the disabled button looks the same as an enabled one except for its label.
- Placeholder: `Hacker News`; the captions and the explanation card are annotations.

### s17 History and bookmarks panel: MISMATCH (5)

- Verified: tabs, `Find a page` field, row layout (icon tile 32 px radius 10, title and URL line, `⋯` button 44 px radius 12 `rgba(235,235,245,.38)` 20 px), `Remove bookmark` as the only action for a bookmark (`:1746`), laptop rows with the `LAPTOP` badge (11 px / 700 / `.04em` / uppercase / `#64B5FF`, `:391`), no `⋯` on laptop rows (`:1722`), URLs shown without scheme and `www.` (`:1717`).
- MISMATCH 1: the design draws a top border and 10 px padding on the first row; code has none (`:311`).
- MISMATCH 2: icon tile colour `#64B5FF`; code `rgba(235,235,245,.64)`.
- MISMATCH 3: titles weight 500; code 400.
- MISMATCH 4: action buttons use padding `0 16px`; code `.item-actions .secondary` uses `0 12px` and 14 px (`:334`).
- MISMATCH 5: field top margin 12; code has 10 (tabs margin-bottom) (`:384`).
- Placeholder: `Hacker News`, `wsyeabsera/tvdash`, `Cloudflare Workers docs`, `Lofi radio`, `MDN Web Docs` and their URLs.

### s18 Library panel: MISMATCH (4)

- Verified: heading `Library`, row headings `Continue watching`, `Sent to the TV`, `From Claude` (13 px / 600 `--text-2`, from the TV, `PROTOCOL.md:48-50`), rows spaced 16 px, sub lines (`3:41 left · 2m ago`, `From a phone · 1h ago`, `From your laptop · 5h ago`, `From Claude · 1d ago`, per `itemSub`, `:1040-1047`, `SENDERS` `:1025`), progress bar 3 px high radius 2, `rgba(255,255,255,.12)` track and `#0A84FF` fill, expanded actions `From the start`, `Up next`, `Remove` in that order (`:1097-1099`), play icon solid for media, link icon for pages.
- MISMATCH 1: titles weight 500 versus 400.
- MISMATCH 2: icon tile colour (design inherits `#F5F5F7`; code `rgba(235,235,245,.64)`).
- MISMATCH 3: progress bar geometry. Design draws it under the whole row, indented 44 px, reaching the right edge; code puts it inside the text column, below the sub line, so it ends before the `⋯` button (`:327-331`, `:1064-1071`).
- MISMATCH 4: action buttons padding `0 16px` versus `0 12px` (`:334`).
- Placeholder: `Big Buck Bunny`, `Conference keynote 2026`, `news.ycombinator.com`, `Lo-fi beats to relax to`, `wsyeabsera/tvdash #12`, all durations and ages.

### s19 Send to TV form and result: MISMATCH (6)

- Verified: heading `Send to TV`, paste button (38 px, radius 11, 13.5 px / 600, `:280-284`), placeholder `Start at 1:30`, buttons `Up next` and `Send`, success box (14 px padding, radius 18, fill `rgba(48,209,88,.1)`, border `rgba(48,209,88,.32)`, 36 px badge radius 11 with `rgba(48,209,88,.2)` and `#30D158`, detail `rgba(235,235,245,.64)`, `:296-306`), error copy `That is not a link` and `Paste a full http(s) address, like the one in your browser’s address bar.` (`:1497`), headline `Opens in the YouTube app` (`:1526`), apps icon.
- MISMATCH 1: result heading weight 700; code `.result strong` is 600 with 2 px below (`:305`).
- MISMATCH 2: error badge is solid `#FF453A` with a white icon; code uses `rgba(255,69,58,.2)` with a red icon (`:303`).
- MISMATCH 3: quotes. The design writes `Opening “Lo-fi beats to relax to” in the YouTube app on the TV.` with curly quotes; the hub's message uses straight quotes (`media.ts:116`).
- MISMATCH 4: the label inside the quotes. For an app scene the hub names it with the app prefix, so the message is `Opening "YouTube: Lo-fi beats to relax to" in the YouTube app on the TV.` (`media.ts:42-43`, `:116`).
- MISMATCH 5: after a successful send the code empties the link and start fields (`remote.html:1528-1529`); the design keeps the link in the field beside the success box.
- MISMATCH 6: `Up next` is 52 px high with radius 16 and 16 px text; code `.secondary` is radius 14 and 15 px (it is stretched to the row height by the primary button, `:393`).
- Also S6. The success and error boxes are drawn in one frame to show both states; only one shows at a time.
- Placeholder: `https://www.youtube.com/watch?v=jfKfPfyJRdk`, `Lo-fi beats to relax to`.

### s20 Share-sheet setup: MISMATCH (2)

- Verified: all copy (`Play on TV from the share sheet.`, `Share a link from YouTube or Safari straight to the TV.`, the three steps, button `Add Play on TV` with arrow, `:689-695`); divider `rgba(255,255,255,.08)` and padding-top 14; 13.5 px `--text-2`; list indent 20 px with 4 px gap (`:253-258`); full-width secondary button.
- MISMATCH 1: top margin 14; code 18 (`:253`).
- MISMATCH 2: bold lead sentence weight 700; code `.share-setup strong` is 600 (`:256`).
- Note: the panel shows only on iPhone, iPad and iPod (`:1597`).

### s21 Arrival from the Android share sheet: MISMATCH (5)

- Verified: link icon, `Opens in the TV's player` headline (`:1473`), Library tab as the landing tab (`:2247`), the shared link being sent at once (`:2256`).
- MISMATCH 1: quotes again: `Playing “The New Vimeo Player” in the TV's player.` versus the hub's straight quotes `Playing "…" in the TV's player.` (`media.ts:114`).
- MISMATCH 2: the design draws the Send button at opacity 0.6 (busy) together with the finished result. In code `aria-busy` is set while the request runs and removed in `finally` (`:1510`, `:1535`); the result appears only after, so the two never show together.
- MISMATCH 3: the sample is a `vimeo.com` page URL. The hub opens anything that is not a media file or a YouTube, Twitch or Netflix link in the TV's browser (`media.ts:117`), so the headline would read `Opens in the TV's browser`.
- MISMATCH 4: the link field still holds the URL; after a successful send code clears it (`:1528`).
- MISMATCH 5: result heading weight 700 versus 600 (as s19).
- Placeholder: `https://vimeo.com/76979871`, `The New Vimeo Player`.

### s22 Type on the TV panel: MISMATCH (1)

- Verified: heading `Type on the TV`, placeholder `A search, an address, a field's text` (`:706`), buttons `Type` and `Enter` with arrow, toast `Pressed Enter on the TV.` for an empty Enter (`:1549`), phone layout with the field on a line of its own and two buttons below (`:443-444`), toast geometry as s04.
- MISMATCH 1: `Type` is drawn at 52 px, radius 16, 16 px; code `.secondary` is radius 14 and 15 px (stretched to 52 px by the row).
- Also S6.

### s23 Up next panel: MISMATCH (6)

- Verified: heading `Up next`, `Play now` button, numbered tiles, title or URL when there is no title (`:1011`), `×` remove buttons, hidden when empty (`:1002`).
- MISMATCH 1: header bottom margin 10; code 14 (h2 margin, `:120`).
- MISMATCH 2: `Play now` min 40 px / 14 px; code `.secondary` min 44 px / 15 px (`:393`).
- MISMATCH 3: row padding 4 px; code `.feed li` 10 px (`:310`).
- MISMATCH 4: design shows a top border on the first row; code does not (`:311`).
- MISMATCH 5: number tile text 13 px / 600; code inherits 15 px / 400 (`:312`).
- MISMATCH 6: `×` font size 22; code 20 (`:317`).
- Placeholder: `Lo-fi beats to relax to`, `Conference keynote 2026`, `https://vimeo.com/76979871`, three items.

### s24 Recent activity panel: MISMATCH (4)

- Verified: heading `Recent activity`, relative times (`3s`, `2m`, `14m`, `1h`, `4d`, no `ago`, `:844-852`), 12.5 px tabular times, icon tiles (`TOOL_ICONS`, `:1272`), `Cleared the screen` (`mcp.ts:164`), up to 8 rows (`:1276`).
- MISMATCH 1: summary text. The code prints the hub's `summary` verbatim. The hub writes the media label (`Big Buck Bunny`, `media.ts:104`), the card title (`Build finished`, `card.ts:18`), `owner/repo#12` without a space for a link (`mcp.ts:46`, `:52`), `Stopped <label>` for stop (`screen.ts:780`). The design shows `Playing “Big Buck Bunny”`, `Showed card “Build finished”`, `Opened wsyeabsera/tvdash #12`, `Stopped playback` and `Queued “Lo-fi beats to relax to”`; none of these strings exist in the hub, and no `Queued` activity is recorded.
- MISMATCH 2: heading margin 10; code 14.
- MISMATCH 3: top border on the first row; code none and 2 px top padding (`:311`).
- MISMATCH 4: icon tile colour (design white, code `rgba(235,235,245,.64)`).
- Placeholder: all six rows and times.

### s25 Bottom tab bar: VERIFIED (shell notes)

- Verified: five tabs, labels and order, `Browse` active (the Browse tab shows `TV browser`, `History & bookmarks` and `Type on the TV`, `data-tab-of="browse"`, `:586`, `:650`, `:699`), 11 px / 600 labels, active `#64B5FF`, fill `rgba(16,16,20,.84)`.
- Shared finding: S3 (border colour and padding), S7.
- Placeholder: the grey skeleton bars are illustration.

### s26 Keyboard bar: MISMATCH (3)

- Verified: title `Typing on the TV` in `#64B5FF` / 600, hint (the field's placeholder, 12.5 px `--text-3`), 12 px side insets, 76 px above the bottom on a phone, max width 560, padding `10px 12px 12px`, radius 20, fill `rgba(28,28,32,.96)`, border `rgba(10,132,255,.45)`, shadow `0 16px 40px rgba(0,0,0,.55)` (`:409-423`), `Enter` primary button.
- MISMATCH 1: the close `×` is `rgba(235,235,245,.64)` at 20 px; code `.field-sheet .rm` is `--text-3` `rgba(235,235,245,.38)` at 22 px, 36 px square (`:421`).
- MISMATCH 2: head margin below 6 in code versus 4 above the row in the design (`:418`).
- MISMATCH 3: field right padding 16 versus 14 (`:423`).
- Placeholder: hint `Search`, typed text `hacker news`.

### s27 Toast: VERIFIED

- Verified: both toasts (success `Stopped. The TV is back to its idle screen.`, error `Couldn't reach the hub. Check your connection.`, `:1334`, `:1339`), icon colours `#30D158` and `#FF453A`, 2.2 s and 4.5 s durations (`:1321`), 84 px above the bottom on a phone (`:438`), geometry as s04.
- Placeholder: the captions in the frame are annotations.

### s28 Installed web app (manifest and icon): MISMATCH (4)

- Verified: manifest values (`remote.ts:9-27`): name `tvdash remote`, short name `tvdash`, description `Control what plays on the TV.`, display `standalone`, orientation `portrait`, start URL `/remote`, background and theme colour `#05060A`, icons SVG any, PNG 192 and 512, 512 maskable, share target `GET /remote` with `url`, `text`, `title`; home-screen label `tvdash`.
- The icon is drawn with its own gradients; compared with `icon.ts:10-21`:
  - MISMATCH 1: radial gradient radii: design `r=.7` for both; code `r=.8` (blue) and `r=.75` (indigo).
  - MISMATCH 2: screen rectangle top: design `y=116`; code `y=146` (`x=116 w=280 h=200 rx=36`).
  - MISMATCH 3: stand: design `M206 366h100`; code `M200 364h112`.
  - MISMATCH 4: play triangle: design `M236 186v60l50-30z` with no stroke; code `M226 200v92l80-46z` with a 16 px rounded blue stroke (larger, rounded).
- The operating-system parts (home screen grid, dock, app colours, wallpaper) are illustration and not verifiable.
- Placeholder: `Mail`, `Photos`, `Maps`, `Music`, `Notes`, `Settings`, `Clock`, `Weather` and all their colours.

### s29 iPhone Play on TV Shortcut: MISMATCH (1)

- Verified: the import question text `Paste the key the tvdash remote copied for you` (`shortcut.mjs:53`), the Shortcut name `Play on TV` (`remote.ts:48`, file name `Play on TV.shortcut`), it accepts URLs, Safari pages and text through the share sheet (`shortcut.mjs:49-50`), notification title `tvdash` (`:77`) with the hub's message as body (`:78`).
- MISMATCH 1: the notification body in the design is `Playing “Lo-fi beats to relax to” in the YouTube app on the TV.`; the hub's message uses straight quotes and the app prefix (`media.ts:116`: `Opening "YouTube: ..." in the YouTube app on the TV.`).
- Not verifiable: all iOS chrome (sheet colours `#1c1c1e`, `#2c2c2e`, `#34c759`, button labels `Key`, `Cancel`, `Done`, `Copy`, `Messages`, `Mail`, `Notes`, `Add to Reading List`, `Edit Actions…`). The Shortcut icon is a blue glyph (colour `#1B9AF7` from `WFWorkflowIconStartColor 463140863`, glyph number 59772); the design's `▶` is a stand-in.
- Placeholder: `Lo-fi beats to relax to`, `youtube.com/watch?v=jfKfPfyJRdk`.

### s30 Claude sign-in, default: MISMATCH (3)

- Verified (`oauth.ts:57-88`): title `Connect Claude to your TV` (the app name is the client name, `Claude` here), body `On the TV, open Pair a device on the toolbar and type the six digits it shows.`, placeholder `123 456`, buttons `Cancel` (fill `#ffffff14`) and `Connect` (`#0a84ff`, white), page background `#05060a`, text `#f5f5f7`, dim `#a1a1aa`, h1 26 px / 1.2 with 8 px below, main width 420, input 32 px / 600 monospace, `.3em` tracking, centred, padding 14, radius 14, border `#ffffff2e`, fill `#ffffff14`, buttons 48 px min, radius 12, 15 px / 600, gap 10, 16 px above.
- MISMATCH 1: `Pair a device` is `#f5f5f7` in the design; code has no rule for `strong`, so it inherits the dim `#a1a1aa` and is only bold (`oauth.ts:66`, `:76`).
- MISMATCH 2: the placeholder is drawn `#a1a1aa66`; code sets no placeholder colour, so the browser default applies.
- MISMATCH 3: button font `system-ui`; code `Inter, system-ui, sans-serif` (`oauth.ts:69`).
- Placeholder: `123 456` is the real placeholder text. The frame is 480 × 700.

### s31 Claude sign-in, error: MISMATCH (2)

- Verified: error copy `That is not the code on the TV.` (`screen.ts:384`, shown through `role="alert"` in `#ff453a` with `margin: 12px 0 0`, `oauth.ts:72`, `:82`); the page itself is the same as s30 and answers with status 403 (`:91`). Other copy the code can show here: `Type the six digits the TV shows.` (`oauth.ts:114`), `The TV is not showing a pairing code. Open Pair a device on the TV.` and `Too many wrong codes. Open Pair a device on the TV again for a new one.` (`screen.ts:378`, `:383`).
- MISMATCH 1 and 2: as s30, `strong` colour and button font.
- MISMATCH 3: the design echoes the typed code `482 913` in the box; the code's input has no `value` attribute (`oauth.ts:81`), so after an error the box is empty and shows the placeholder `123 456`.
- Placeholder: the wrong code `482 913`.

### s01b Desktop two-column layout: MISMATCH (3)

- Verified: wrap max width 1080, top padding 28, header bottom margin 24, columns `minmax(0, 1.15fr) minmax(0, 1fr)` with a 20 px column gap, panel padding 26, no tab bar, control gap 36 (`clamp` upper bound), panels `Library`, `TV browser`, `History & bookmarks`, `Send to TV` (`:102-119`), the Touchpad panel absent (hidden for a mouse, `:365`).
- MISMATCH 1: gap inside each column is 14; code uses 20 at 880 px and wider (`:106`).
- MISMATCH 2: control border `.14` versus `.18` (as s06).
- MISMATCH 3: the forward glyph is mirrored (as s06).
- Incomplete rather than wrong: code also shows `Remote` (D-pad, volume), `Type on the TV`, `Up next` (when queued) and `Recent activity` on a desktop; the design omits them.
- Placeholder: `Big Buck Bunny` and all list rows.

### s05-shader Scene states (shader look): MISMATCH (6, design-only variant)

- The copy and layout equal s05 and match `describe()` the same way. The look is a proposal that the code does not implement: the page uses flat glass (`remote.html:108-116`). Design-only styling: gradient glass fill with a light-streak overlay (`mix-blend-mode: overlay`) on panels; gradient hairline border built by a masked pseudo-element; gradient pill and chip with inset highlights; glow on the connection and state dots (`box-shadow ... currentColor`); inset highlights and a glossy overlay on the art tile; a full-height SVG shader layer behind the content. Colours added by the variant (for example `rgba(255,255,255,.17)`, `.34`, `.5`) are in no code.
- Placeholder: same sample data as s05.

## Unclear or not verifiable

- OS-drawn frames (s09 lock screen, s28 home screen, s29 iOS sheets): only the strings and artwork the code supplies could be checked; the colours, type sizes and layout of those frames belong to iOS or Android.
- The `10` seek label baseline and the sub-pixel position of icon strokes (S7) were not compared.
- Whether the first poll of an unpaired phone really shows the calm `Connecting` pill of s03 (see the s03 note): the 401 path suggests `Reconnecting` then `Hub unreachable`; not run on a device.
- Touchpad height in s14 (416 px) depends on the device's safe-area insets; the formula is in `remote.html:441`.
- `backdrop-filter` blur strength (28 px, 24 px) cannot be seen in the flat frames.
- The `PROTOCOL.md` row titles (`Continue watching`, `Sent to the TV`, `From Claude`) come from the TV and hub, not from `remote.html`; verified against `PROTOCOL.md:48-50`, not against Kotlin code.
- The `vimeo.com` classification (s21) was read from the comment and message in `media.ts:108-117`, not exercised against the function that picks the open mode.
- Fonts: the design names `Inter, system-ui, sans-serif`; the code loads Inter 400 to 700 from Google Fonts with `-apple-system` and `SF Pro Text` ahead of the system fallbacks (`:35`, `:19`). A device without Inter renders differently from the design.
