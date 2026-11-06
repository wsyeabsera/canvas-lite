---
sidebar_position: 20
slug: /tvdash-tv-screens
---

# tvdash: the real TV screens

:::caution Design caveat
The Lite canvases for tvdash were designed from this inventory by parallel Claude sessions. Those sessions sometimes read shortened code (the owner's compression layer elides parts of files), so a screen may contain example values the session invented: hostnames, ids, timestamps, error codes and sample copy. The owner accepted the designs as they are (2026-11-06). Check any such value against the real code before relying on it.
:::


An inventory of every screen, overlay and state the tvdash TV app (Compose for TV, `/Users/yab/Hobby/tvdash/tv`) can draw today, read from its source. Paths below are relative to `tvdash/tv/app/src/main/kotlin/dev/tvdash/` unless they start with `tvdash/`. Line numbers are where the composable or function starts.

Sources read: `tvdash/README.md`, `tvdash/PROTOCOL.md`, `tvdash/protocol/scene.schema.json` and `tvdash/protocol/fixtures/`, every Kotlin file under `tv/app/src/main/kotlin`, `res/values/strings.xml` (it holds only `app_name` = "tvdash": every on-screen string is hard-coded in Kotlin), `res/font/` and `AndroidManifest.xml`.

**Units.** The app lays out on a 960 x 540 dp canvas ("1080p at density 320", `ui/Theme.kt`). So **1 dp = 2 px** at 1920 x 1080, and (at the default font scale) **1 sp = 2 px**. Pixel values in brackets below are that conversion.

## Index

| # | Screen or state | File | Trigger |
|---|---|---|---|
| 1 | App frame: aurora backdrop + scene transition | `ui/TvdashScreen.kt`, `ui/Aurora.kt` | always |
| 2 | Connection status pill (Connecting, Connected, Reconnecting, Demo) | `ui/Components.kt` | the WebSocket's state |
| 3 | Idle, empty home: clock, date, prompt, toolbar, Recent feed | `ui/TvdashScreen.kt` | `clear_screen`, stop, no scene yet, unknown scene type; library, pins and bookmarks all empty |
| 4 | Home with rows (library, pins, bookmarks) | `ui/Home.kt` | idle scene while the library, pins or TV bookmarks have something |
| 5 | Toolbar (all its button states) | `ui/Toolbar.kt` | on screens 3 and 4 |
| 6 | Home tile actions sheet | `ui/Home.kt`, `ui/ActionSheet.kt` | hold OK or Menu on a library tile |
| 7 | Card: info | `ui/TvdashScreen.kt` | `show_card(kind: "info")`, or an unknown kind |
| 8 | Card: success | `ui/TvdashScreen.kt` | `show_card(kind: "success")` |
| 9 | Card: warning | `ui/TvdashScreen.kt` | `show_card(kind: "warning")` |
| 10 | Link card with QR code | `ui/TvdashScreen.kt`, `ui/Qr.kt` | `open_link` (non-GitHub URL) |
| 11 | GitHub PR / issue card (state, checks, diff) | `ui/Github.kt` | `open_link` with a GitHub PR or issue URL the hub could fetch |
| 12 | Media scene drawn as a link card | `ui/TvdashScreen.kt` | `play_media` scene behind the player, after Back, or after an app hand-off |
| 13 | Player, full screen: loading / buffering | `player/PlayerScreen.kt` | `play_media` with `open: "player"` |
| 14 | Player: playing (controls overlay, auto-hide) | `player/PlayerScreen.kt` | same |
| 15 | Player: paused | `player/PlayerScreen.kt` | OK / Play-Pause, `control_playback(pause)` |
| 16 | Player: live stream | `player/PlayerScreen.kt` | a stream with no duration |
| 17 | Player: "Press Back again to leave" | `player/PlayerScreen.kt` | first Back during playback |
| 18 | Player: Up next line and end countdown | `player/PlayerLogic.kt` | `queue_media` while a video plays |
| 19 | Player: error ("Can't play this video") | `player/PlayerScreen.kt` | ExoPlayer error |
| 20 | Player: ended | `player/PlayerScreen.kt` | video reaches the end |
| 21 | Player actions sheet | `player/PlayerScreen.kt` | hold OK or Menu in the player |
| 22 | Up next tray | `player/PlayerScreen.kt` | Down in the player when the queue is not empty |
| 23 | Corner (mini) player | `ui/Browser.kt` | Up in the player, `POST /send` with `corner: true`, or a card/link pushed during playback |
| 24 | YouTube / Twitch / Netflix hand-off | `ui/Browser.kt`, `apps/AppLaunch.kt` | `play_media` with `open: "app"` |
| 25 | Browser start page | `ui/StartPage.kt` | toolbar Browse / Bookmarks / History, typing with the browser closed |
| 26 | Browser: page view (pointer, link ring, hint, progress) | `ui/TvBrowser.kt` | OK on a link card, `play_media` with `open: "browser"`, failed app hand-off, `browse` message |
| 27 | Browser: address and controls bar | `ui/BrowserBar.kt` | Menu in the browser |
| 28 | Browser: quick actions sheet | `ui/TvBrowser.kt`, `ui/QuickActions.kt` | hold OK on a page |
| 29 | Browser: Bookmarks / History panel | `ui/LibraryPanel.kt` | quick actions, voice, toolbar Bookmarks / History |
| 30 | Browser: Shields panel | `ui/ShieldsPanel.kt` | Shields button in the bar |
| 31 | Browser: "Video found on this page" sheet | `ui/TvBrowser.kt` | a playable stream found on the page |
| 32 | Browser: numbered links | `ui/TvBrowser.kt` | quick action "Number the links", voice "show links" |
| 33 | Browser: pills (notice, presenting, blocked count, redirect, video) | `ui/TvBrowser.kt` | various, see section |
| 34 | Browser: web video full screen | `ui/TvBrowser.kt` | a page's video goes full screen |
| 35 | Steps: a step, no timer | `ui/Steps.kt` | `show_steps` |
| 36 | Steps: timer ready / paused / running | `ui/Steps.kt` | a step with `timerSec` |
| 37 | Steps: timer done banner + chime | `ui/Browser.kt` | a running step timer reaches 0 |
| 38 | The wall (pins grid) | `ui/Wall.kt` | toolbar The wall, the Pins row, or 5 min idle on home with pins |
| 39 | The wall: one pin full screen | `ui/Wall.kt` | OK on a wall tile |
| 40 | The wall: unpin sheet | `ui/Wall.kt` | hold OK on a wall tile |
| 41 | Pair a device (code, QR, devices, errors) | `ui/Pairing.kt` | toolbar Pair a device |
| 42 | Voice banner (listening, replies, failures) | `ui/Browser.kt`, `remote/VoiceInput.kt` | the remote's mic key, toolbar Voice |
| 43 | Keys, typing, touch and volume from the hub | `MainActivity.kt`, `remote/` | `POST /key`, `/type`, `/browse`, `/touch`, `/volume` |

## Shared design tokens

All from `ui/Theme.kt` unless noted. The comment at the top of the file names the language: "deep near-black, frosted glass, Inter at 10-foot sizes, Apple's system accent colours".

### Colour palette (`object Palette`, `ui/Theme.kt:23`)

| Token | Value (ARGB as written) | Meaning |
|---|---|---|
| `ink` | `#FF05060A` | background, near-black |
| `inkRaised` | `#FF0C0E15` | raised surface; top of the backdrop gradient; bar and Shields fills |
| `text` | `#FFF5F5F7` | primary text; also the fill of a focused toolbar button or sheet row |
| `textSecondary` | `#B3EBEBF5` (`#EBEBF5` at 70%) | secondary text |
| `textTertiary` | `#73EBEBF5` (`#EBEBF5` at 45%) | hints, captions, timestamps |
| `hairline` | `#2EFFFFFF` (white 18%) | glass borders, empty diff blocks |
| `glass` | `#14FFFFFF` (white 8%) | glass panel fill, unfocused buttons |
| `glassFocused` | `#24FFFFFF` (white 14%) | focused glass, step track, timer track |
| `blue` | `#FF0A84FF` | info accent, links, progress fills, badge, cursor |
| `green` | `#FF30D158` | success, connected, PR open, checks passed, additions, Shields dot |
| `orange` | `#FFFF9F0A` | warning, reconnecting, steps, link numbers, presenter dot, pairing problems |
| `red` | `#FFFF453A` | PR closed, checks failed, deletions, LIVE badge |
| `purple` | `#FFBF5AF2` | PR merged; second aurora field |
| `teal` | `#FF40C8E0` | third aurora field |

Card accent (`Palette.accent`): info = blue, success = green, warning = orange.

Other colours written in place:

- Home tile grounds, picked by URL hash (`ui/Home.kt:86`): `#233150`, `#2A3B2F`, `#3B2A35`, `#2E2A3B`, `#3A3222`.
- QR modules `#0B0B0F` on white (`ui/Qr.kt:50`).
- Scrims: action sheet black 55%, library panel black 60%, player overlay gradient to black 78%, Up next tray gradient to black 85%, paused disc black 45%, browser pills `ink` at 80%, browser bar `inkRaised` at 94%, Shields panel `inkRaised` at 96%.
- Tile progress track white 20%; player progress track white 22%; focus ring pure white.

### Type (`object Type`, `ui/Theme.kt:70`)

Fonts are bundled (`res/font/`): **Inter** (Regular 400, Medium 500, SemiBold 600, Bold 700) and **Inter Display** (Thin 100, ExtraLight 200, Light 300, Medium 500, SemiBold 600).

| Style | Family, weight | Size / line height | Tracking | px at 1080p |
|---|---|---|---|---|
| `clock` | Inter Display Thin | 156 sp | -0.03 em | 312 px |
| `hero` | Inter Display SemiBold | 44 / 50 sp | -0.02 em, heading line break | 88 / 100 px |
| `headline` | Inter Display SemiBold | 34 / 40 sp | -0.015 em | 68 / 80 px |
| `title` | Inter Display SemiBold | 28 / 34 sp | -0.01 em | 56 / 68 px |
| `dateLine` | Inter Display Medium | 26 sp | -0.01 em | 52 px |
| `body` | Inter Regular | 22 / 32 sp | 0 | 44 / 64 px |
| `callout` | Inter Medium | 18 / 24 sp | 0 | 36 / 48 px |
| `caption` | Inter Medium | 15 / 20 sp | 0 | 30 / 40 px |
| `eyebrow` | Inter SemiBold | 14 sp | +0.14 em | 28 px |

One-off: the pairing code uses `clock` with Light weight, 72 / 80 sp (144 / 160 px) (`ui/Pairing.kt:147`).

### Spacing (`object Spacing`, `ui/Theme.kt:47`)

| Token | dp | px | Use |
|---|---|---|---|
| `safeHorizontal` | 48 | 96 | overscan-safe side margin (5% of 960) |
| `safeVertical` | 27 | 54 | overscan-safe top/bottom margin (5% of 540) |
| `panelPadding` | 40 | 80 | inside card, link and GitHub panels |
| `gap` | 16 | 32 | start page tile gap |

Scenes sit inside `SafeArea(topInset = 44.dp)` (`ui/TvdashScreen.kt:72`), so scene content spans x 48..912 dp and y 71..513 dp (96..1824 px, 142..1026 px). The 44 dp band keeps the status pill clear.

### Shapes and radii

| Radius | Where |
|---|---|
| 32 dp | `GlassPanel` default: card, link, GitHub, activity feed, action sheet, library panel |
| 50% (pill) | status pill, toolbar buttons, state chip, browser bar buttons, address field, browser pills, voice and timer banners, library tabs |
| 28 dp | browser bar, Shields panel |
| 24 dp | start page tiles; toolbar focus-ring corner |
| 20 dp | QR tile |
| 16 dp | corner player, wall tiles and full-screen pin |
| 14 dp | home tiles, pin tiles, device rows, library rows |
| 12 dp | action sheet rows |
| 8 dp | link ring in the browser |
| 6 dp | LIVE badge, link numbers |
| 4 dp | player progress track |
| 3 dp | diff blocks, step progress segments |
| circle | kind glyph disc, status dot, feed dots, check dots, knob, paused disc, library row initial |

### Glass panel (`GlassPanel`, `ui/Components.kt:46`)

Clip to shape (default 32 dp), fill `glass` (focused: `glassFocused`), then a vertical gradient white 5% to transparent over it, then a 1 dp border whose vertical gradient runs `hairline` (top) to white 5% (bottom; focused: white 22%). No blur: "frosted" is the translucent fill over the aurora.

### Focus (`FocusRing`, `Modifier.focusRing`, `ui/Components.kt:144`, `:155`)

One focus look everywhere: a **white 3 dp ring drawn 4 dp outside** the item's rounded edge (corner = item corner + inset), plus a **lift to 1.06x**, both animated over **150 ms** (instant with reduced motion). Call sites change the lift: big panels 1.02, toolbar 1.04, wall tiles 1.03, rows and sheet rows 1.02. Exceptions: `BarButton` (browser bar, start page buttons, Shields buttons) has no ring, only a white fill; start page tiles use a spring scale to 1.04 without a ring.

### Motion

- **Scene change** (`sceneTransition`, `ui/TvdashScreen.kt:101`): enter = fade in 450 ms after a 120 ms delay + scale from 0.94 (spring, damping 0.82, low stiffness) + slide up from 1/20 of the height (spring, damping 0.85); exit = fade out 220 ms + scale to 1.03 over 260 ms. Keyed by scene id, so a `control` update does not animate.
- **Reduced motion** (`LocalReduceMotion`): true when Android's animator duration scale is 0 (`MainActivity.kt:106`). Then transitions are instant, the aurora stops drifting, the status pill does not pulse, focus is instant.
- **Aurora** (`AuroraBackground`, `ui/Aurora.kt:44`): see screen 1.

### Icons

There is no icon font or image icon set. Every glyph is drawn as strokes on a `Canvas`: kind glyphs (`KindGlyph`, `ui/Components.kt:97`), toolbar glyphs (`drawGlyph`, `ui/Toolbar.kt:121`), paused triangle, spinner arc, timer ring, browser pointer arrow. Hints use Unicode: ▶ ◀ ▲ ▼ ▶❙❙ ⏩ · …. Launcher assets: `res/mipmap-xxxhdpi/ic_launcher.png`, `res/drawable-xhdpi/banner.png` (Android TV banner).

## Remote rules (all screens)

From `remote/Remote.kt:5`:

- The D-pad moves one focus ring; held arrows keep moving.
- OK opens or plays what has focus. **Holding OK** (its first auto-repeat, `RemoteKey.OkHold`) or **Menu** opens that item's actions.
- Back goes up exactly one level: player, then its card, then home. In the player the first Back only arms "Back again to leave" (3 s window, `BACK_AGAIN_MS`).
- Play/Pause works on any screen with something to play; on home it reopens the scene's video or brings the corner video full screen (`ui/Browser.kt:198`).
- The mic key (`KEYCODE_SEARCH`, `KEYCODE_VOICE_ASSIST`) listens on every screen, the player included.
- Home belongs to Android TV; the app never sees it.
- Key mapping: Enter and numpad Enter count as OK; Escape as Back; Space as Play/Pause.

---

## 1. App frame: aurora backdrop and scene transitions

- **Source:** `ui/TvdashScreen.kt:45` `TvdashScreen`; `ui/Aurora.kt:44` `AuroraBackground`; `ui/Browser.kt:67` `TvdashApp` (the layer order).
- **Layout:** full screen. Bottom layer the aurora; on it the scene inside `SafeArea(topInset = 44.dp)`; the status pill in the top-right safe corner. `TvdashApp` then stacks, in this order: the player (full screen or corner), the wall, Pair a device, the browser, then the banners (timer done, voice) "last, over the player, the browser and the wall".
- **Aurora:** painted at a quarter of the screen's resolution and scaled up 4x. A vertical gradient `inkRaised` to `ink`, then three radial colour fields: the scene's tint at 30% (centre 78%/12% of the screen, radius 55% of the width), `purple` at 14% (12%/95%, radius 50%), `teal` at 8% (40%/55%, radius 40%, twice the speed). Each drifts on a circle (8% of width, 10% of height) over a 60 s loop, redrawn 15 times a second. A vignette (transparent to `ink` 65%, radius 75% of the larger side) on top.
- **Tint** (`Scene.tint`, `ui/TvdashScreen.kt:123`): a card's accent (blue/green/orange); a GitHub link's state colour (green/purple/red/tertiary grey); blue for everything else. Changes animate over 1200 ms, fast-out-slow-in.
- **Trigger:** always.

## 2. Connection status pill

- **Source:** `ui/Components.kt:75` `StatusPill`; states in `enum class Connection` (`ui/Components.kt:66`); driven by `hub/HubConnection.kt:67`.
- **Layout:** top-right inside the safe area (48 dp from the right, 27 dp from the top: 96 / 54 px). A pill `GlassPanel`, padding 14 x 7 dp, an 8 dp dot, 8 dp gap, the label in `caption`, colour `textSecondary`.
- **States and copy:**

| State | Label (exact) | Dot colour | When |
|---|---|---|---|
| Connecting | "Connecting…" | `textTertiary` | app start, before the socket opens (`HubConnection._state` initial) |
| Connected | "Connected" | `green` | socket open or a state message arrived |
| Reconnecting | "Reconnecting…" | `orange`, dot pulses alpha 0.35 to 1, 900 ms, reversing | socket closed or failed; retries with backoff (500 ms base, 30 s cap, jitter between half and full cap) |
| Demo | "Demo" | `blue` | debug builds started with `--es demo <fixture>` (`MainActivity.kt:210`) |

- **Notes:** the pill belongs to `TvdashScreen`, so the full-screen player, browser, wall and pairing screen cover it. There is **no "Disconnected" state**: the TV keeps showing the last scene while it retries ("Every message is the full state"). A hub that refuses the socket (for example 401 with auth on) also shows only as "Reconnecting…". The toolbar's Refresh drops the socket and connects again now.

## 3. Idle, empty home

- **Source:** `ui/TvdashScreen.kt:130` `IdleScene`; feed `ui/ActivityFeed.kt:26` `ActivityFeed`.
- **When:** the scene is `idle` (also before the first message, for a scene type this build does not know, and after Back dismissed a pushed scene) **and** the library rows, pins and the TV browser's bookmarks are all empty. Otherwise screen 4.
- **Layout:** bottom-left column, padding start 8 dp, bottom 24 dp:
  - clock, `clock` style (312 px Thin), `text`. Format "HH:mm" on a 24-hour TV, "h:mm" otherwise, no AM/PM (`ui/Format.kt:14`). Updates on the minute.
  - date line, `dateLine`, `textSecondary`, start padding 6 dp; pattern "EEEE, d MMMM" (e.g. "Wednesday, 28 October").
  - 18 dp, then "Ask Claude to put something on this screen" in `callout`, `textTertiary`.
  - 20 dp, then the toolbar (screen 5) with **Browse the web focused**.
  - bottom-right: the **Recent** feed, padding bottom 24 dp. A `GlassPanel` 340 dp wide (680 px), padding 28 dp, 18 dp between lines. "Recent" in `title`, `text`; up to 6 items, each an 8 dp dot (7 dp from the top) and, 14 dp right, the summary (`callout`, `text`, one line, ellipsis) over "`<label>` · `<relative time>`" (`caption`, `textTertiary`). Hidden entirely when the activity list is empty.
  - dot colour: `show_card` green, `open_link` blue, anything else `textTertiary`.
  - label (`activityLabel`, `ui/Format.kt:45`): "Card", "Link", "Cleared"; any other tool name turned into words ("play_media" becomes "Play media").
  - relative time (`relativeTime`, `ui/Format.kt:21`): "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago".
- **Remote:** D-pad along the toolbar. Play reopens a player video if the scene is one. Mic works.
- **Trigger:** `clear_screen`, `control_playback(stop)` (the hub replaces the scene with idle), or nothing sent yet.

## 4. Home with rows

- **Source:** `ui/Home.kt:95` `HomeScene`; tiles `ui/Home.kt:263` `TvTile`, `ui/Home.kt:238` `PinTile`.
- **When:** the idle scene while any of these is non-empty: the hub's `library` rows, `pins`, the TV browser's bookmarks (plus the laptop's "TV" folder, `bookmarks` in the state message).
- **Layout (top to bottom):**
  1. Toolbar (screen 5), padding start 8 dp, bottom 18 dp. Reached with Up from the rows.
  2. Header row, 110 dp tall (220 px), start padding 8 dp. Left (fills): the focused item's title (`headline`, `text`, 2 lines, ellipsis; the address without scheme or "www." when untitled) and, 8 dp below, its detail line (`callout`, `textSecondary`). Before any tile has focus: "Ask Claude to put something on this screen" in `title`, `textSecondary`. Right, end-aligned: clock in `hero` (88 px), date in `caption`, `textSecondary`.
  3. A vertical list of rows, 22 dp apart, padding top 12 dp, bottom 24 dp. Each row: its title in `callout`, `text`, start padding 8 dp; 12 dp; a horizontal row of tiles 18 dp apart with 10 dp padding (room for the ring and lift).
- **Rows, in order:**
  - **"Pins"** (only with pins): first a tile "The wall: `<n pins>`" ("1 pin", "3 pins") on `inkRaised`, then one `PinTile` per pin showing the pin's picture (fetched from `<hub>/pins/<id>.jpg`; until it loads, the pin title in `callout`, `textTertiary` on `inkRaised`). OK on any opens the wall.
  - **"Bookmarks"** (only with TV or laptop bookmarks), most used first, then the laptop's not already present. OK opens the page in the browser.
  - The hub's library rows, empty ones skipped, titles as sent: **"Continue watching"**, **"Sent to the TV"**, **"From Claude"** (`PROTOCOL.md`, Library).
- **Tile (`TvTile`):** 208 x 117 dp (416 x 234 px, 16:9), radius 14 dp, ground colour from the URL hash (palette above). Title bottom-left, padding 14 dp sides and 16 dp bottom, `callout`, `text`, 2 lines, ellipsis. When position and duration are known, a 4 dp progress bar along the bottom edge: white 20% track, `blue` fill. Focus ring corner 14 dp, lift 1.06.
- **Detail line** (`itemLine`, `ui/Home.kt:54`): "23:10 of 48:00 · from your browser", "YouTube · from your phone", "github.com · from Claude". Sources: "from Claude", "from your browser", "from your phone", "from the command line"; `tv` and `other` add nothing.
- **Remote:** D-pad between tiles; focus returns to the last focused tile after the player or browser closes (else the first tile). OK on a link (or an item that opens in the browser) opens the in-app browser; OK on media sends it back through the hub, resuming where it stopped. Hold OK or Menu: screen 6. 5 minutes without a key with pins present opens the wall (`WALL_AFTER_MS`).
- **Note:** the Recent activity feed is not shown on this home, only on screen 3.

## 5. Toolbar

- **Source:** `ui/Toolbar.kt:70` `TvToolbar`, `:94` `ToolbarButton`, `:53` `toolbarItems`, glyphs `:121`; actions handled in `ui/Browser.kt:214`.
- **Layout:** a horizontal row (scrolls sideways if too wide), 12 dp between buttons, 6 dp padding. Button: pill, padding 18 x 11 dp, a 20 dp stroke glyph, 10 dp gap, label in `callout`, one line. Unfocused: `glass` fill, `text` ink. Focused: `text` (#F5F5F7) fill, `ink` glyph and label, ring corner 24 dp, lift 1.04. Disabled: alpha 0.4, skipped by the D-pad. Badge: a `blue` pill, padding 8 x 1 dp, count in `caption`, white.
- **Buttons, in order (exact labels):**

| Label | Glyph | State rules | Action |
|---|---|---|---|
| "Home" | house outline | always | closes browser and wall, dismisses the pushed scene |
| "Browse the web" | globe | always; focused first on screen 3 | opens the browser start page |
| "Bookmarks" | bookmark ribbon | always | browser with the Bookmarks panel |
| "History" | clock face | always | browser with the History panel |
| "Up next" | three lines + chevron | badge = queue length; disabled when the queue is empty | asks the hub to play the next item (`onControl("next")`) |
| "The wall" | 2 x 2 rounded squares | disabled without pins | opens the wall |
| "Voice" | microphone | always | starts listening (screen 42) |
| "Refresh" | circular arrow | always | re-reads home rows and reconnects the socket now |
| "Pair a device" | phone + plus | always | opens screen 41 |

## 6. Home tile actions sheet

- **Source:** `ui/ActionSheet.kt:88` `ActionSheet`, rows `:119` `SheetRow`; options `ItemAction` `:40`, `itemActions` `:48`; opened from `ui/Home.kt:224`.
- **Layout (shared by every sheet in the app):** full-screen black 55% scrim; a `GlassPanel` 340 dp wide (680 px), right-aligned with 48 dp end padding, vertically centred. Inside: padding 24 dp, 10 dp gaps; the title (`title`, `text`, 2 lines) then one row per option. Row: full width, radius 12 dp, padding 18 x 14 dp, label `callout`. Unfocused `glass` fill and `text` label; focused `text` fill with `ink` label, ring corner 12 dp, lift 1.02. The first row takes focus.
- **Copy:** title = the item's title or address. Options: "Play from the start" (media already started), "Add to Up next" (media), "Send back to laptop", "Remove".
- **Remote:** Up/Down between rows, OK picks and closes, Back closes.

## 7, 8, 9. Card: info, success, warning

- **Source:** `ui/TvdashScreen.kt:150` `CardScene`; glyph `ui/Components.kt:97` `KindGlyph`.
- **Layout:** centred `GlassPanel`, max width 720 dp (1440 px), padding 40 dp. Top row: the kind glyph (a 48 dp disc of the accent at 18%, a stroke symbol at half size, stroke 13% of its width, round caps), 16 dp, then the kind label in `eyebrow`, accent colour: **"INFO"**, **"SUCCESS"**, **"WARNING"** (`name.uppercase()`). 28 dp; the title in `hero`, `text`, up to 3 lines with ellipsis. 14 dp; the body in `body`, `textSecondary`, up to 6 lines. 32 dp; "From Claude · `<relative time>`" in `caption`, `textTertiary`.

| Kind | Accent | Glyph | Aurora tint |
|---|---|---|---|
| info | `blue` #0A84FF | dot over a vertical bar ("i") | blue |
| success | `green` #30D158 | check mark | green |
| warning | `orange` #FF9F0A | vertical bar over a dot ("!") | orange |

- **Not focusable:** nothing on a card takes focus. Back goes home (`BackHandler`); the next push shows again.
- **Trigger:** `show_card(title, body, kind)`, `POST /card`. A kind the TV does not know is shown as info (`PROTOCOL.md`; `Scene.Card.kind` defaults to Info with `coerceInputValues`). The footer always says "From Claude", even for a card sent with `POST /card` or the CLI.
- **During playback:** a card pushed while a video plays sends the video to the corner (screen 23).

## 10. Link card with QR code

- **Source:** `ui/TvdashScreen.kt:176` `LinkScene`; panel `ui/Browser.kt:401` `OpenablePanel`; QR `ui/Qr.kt:38` `QrTile`.
- **Layout:** centred focusable glass panel, max width 820 dp (1640 px), padding 40 dp, takes focus as soon as it shows (focused: `glassFocused` fill, brighter border, ring corner 32 dp, lift 1.02). A row:
  - left column (fills): host in `callout`, `blue` ("www." removed); 20 dp; the title in `hero`, `text`, 3 lines (no title: the address without scheme, "www." and trailing slash); optional note, 14 dp below, `body`, `textSecondary`, 4 lines; 28 dp; "From Claude · `<relative time>`" in `caption`, `textTertiary`.
  - 40 dp gap, then a centred column: the QR tile (white, radius 20 dp, padding 14 dp, code area 184 dp = 368 px; medium error correction, drawn module by module in #0B0B0F); 14 dp; "Scan to open on your phone" (`caption`, `textSecondary`) and "Press OK to open here" (`caption`, `textTertiary`).
- **Remote:** OK opens the URL in the in-app browser (screen 26). Back goes home.
- **Trigger:** `open_link(url, title?, note?)`, `POST /link`; also GitHub URLs when the hub has no GitHub data (rate-limited: "falls back to a plain link card", README).

## 11. GitHub PR / issue card

- **Source:** `ui/Github.kt:66` `GithubScene`; `StateChip` `:114`, `ChecksSummary` `:127`, `Stat` `:136`, `DiffSummary` `:144`, `diffBlocks` `:36`.
- **Layout:** like the link card but max width 860 dp (1720 px), QR 160 dp (320 px). Left column:
  - a row, 12 dp gaps: the **state chip** (pill, state colour at 16%, padding 14 x 6 dp, an 8 dp dot and the state name in `callout`, state colour) and "Pull request" or "Issue" in `callout`, `textSecondary`.
  - 20 dp; "`<owner/name>` #`<number>`" in `callout`, `textTertiary`.
  - 6 dp; the title in `headline`, `text`, 2 lines.
  - 10 dp; "by `<author>` · shared `<relative time>`" in `caption`, `textTertiary`.
  - if checks or diff are known: 24 dp, then a row, 28 dp gaps: checks, then diff.
  - optional note: 22 dp, `body`, `textSecondary`, 3 lines.
  - right column as on the link card: QR, "Scan to open on your phone", "Press OK to open here".
- **State chip (label is the enum name):**

| `state` | Label | Colour |
|---|---|---|
| open | "Open" | `green` |
| merged | "Merged" | `purple` |
| closed | "Closed" | `red` |
| draft | "Draft" | `textTertiary` |

- **Checks:** up to three stats, 16 dp apart, each a 10 dp dot and text in `callout`, `textSecondary`: "`<n>` passed" (green dot), "`<n>` failed" (red), "`<n>` running" (orange). A zero count is left out. (`checksVerdict` computes Passing/Running/Failing but is not drawn.)
- **Diff:** "+`<additions>`" in `callout` green, "−`<deletions>`" (a real minus sign) in `callout` red, then five 12 dp squares, radius 3 dp, 3 dp apart: green for additions, red for deletions, `hairline` when both are 0. A non-empty side always keeps at least one block.
- **Aurora tint:** the state colour.
- **Remote:** OK opens the PR in the in-app browser; Back goes home.
- **Trigger:** `open_link` with a `github.com/<owner>/<repo>/pull/<n>` or `/issues/<n>` URL; the hub adds `github`.

## 12. Media scene drawn as a link card

- **Source:** `ui/TvdashScreen.kt:92`: "Until the player, browser and app hand-off land (#1284-#1286), media shows as a link card." The player, browser and app hand-off have since landed in `TvdashApp` on top of it; this branch still draws what is *behind* them.
- **What shows:** exactly screen 10 built from the media scene: host, the title (or address), no note, "From Claude · …", QR of the media URL, "Press OK to open here".
- **When it is visible:** after Back twice leaves the player (the scene stays a media scene); while an app hand-off is in front and the user comes back to tvdash; briefly behind the player as it opens. OK (or Play) on it reopens the player for a player video (`ui/Browser.kt:241`); for other media OK opens the browser.

## 13 to 20. Player (in-app, full screen)

- **Source:** `player/PlayerScreen.kt:151` `PlayerScreen`; overlay `:350` `PlayerOverlay`; `ProgressBar` `:419`; `PausedGlyph` `:469`; `Spinner` `:490`; `ErrorPanel` `:504`; logic `player/PlayerLogic.kt`.
- **Trigger:** `play_media` when the hub decides `open: "player"` (mp4, webm, m3u8, mpd, … or a `format` from the extension); `POST /send`; replays from home tiles; Up next. The player opens full screen unless `corner` is set.
- **Base layout:** full-screen black box, the ExoPlayer video (`ContentFrame`) filling it. The controls overlay fades in over 200 ms and out over 600 ms. It stays while paused, buffering, loading or failed; while playing it hides **4 s** after the last key or control (`OVERLAY_HIDE_MS`). Hidden while the Up next tray is open and in the corner window.
- **Overlay layout** (`PlayerOverlay`):
  - a 260 dp (520 px) bottom scrim, vertical gradient transparent to black 78%.
  - a centre glyph by state (below).
  - bottom column, padding 64 dp sides (48 + 16) and 39 dp top/bottom (27 + 12): a row with the title (`title`, `text`, one line, ellipsis; the host when untitled), 24 dp, then the hint on the right; optional Up next line 10 dp below (`callout`, `textSecondary`); 16 dp; the progress bar; 10 dp; elapsed time left and "-`<remaining>`" right (`caption`, `textSecondary`; "0:42", "9:56", "1:02:03").
  - progress bar: a 20 dp tall area; track 8 dp, radius 4 dp, white 22%; fill `blue`; knob a 20 dp white circle centred on the position.
  - hint (exact): "OK pause · ◀ ▶ 10 s, hold to scrub · ▲ browse · Back twice to leave" while playing, "OK play · …" otherwise, in `caption`, `textTertiary`.

| # | State | What is different | Status sent to the hub |
|---|---|---|---|
| 13 | Loading / buffering | centre: `Spinner`, 56 dp, a white 90% arc of 270 degrees, stroke 6 px (written in px, not dp), round cap, one turn per 900 ms linear | `loading` / `buffering` |
| 14 | Playing | no centre glyph; overlay hides after 4 s; any key brings it back | `playing`, every 5 s and on every change |
| 15 | Paused | centre: `PausedGlyph`, a 112 dp disc of black 45% with a 40 dp white play triangle; overlay stays | `paused` |
| 16 | Live | no progress bar or times: a `red` badge, radius 6 dp, padding 10 x 3 dp, "LIVE" in `eyebrow`, white; 12 dp; the host in `caption`, `textSecondary` | no `durationSec` |
| 17 | Back armed | the hint is replaced by "Press Back again to leave" in `callout`, `text`; a second Back within 3 s leaves | unchanged |
| 18 | Up next | line "▼ Up next: `<title>`"; in the last 15 s of a playing video "Up next in `<n>` s: `<title>`" | unchanged |
| 19 | Error | centre: `ErrorPanel`: "Can't play this video" (`title`, `text`), 8 dp, the error as "`<ERROR_CODE_NAME>`: `<message>`" ("playback failed" when there is no message) in `caption`, `textSecondary`, 12 dp, then the choices in `callout`, `text`: "OK try again · ▼ open the page instead · Back to return" for a stream found on a page (`referer`), else "OK try again · Back to return". For a found stream failing with an `ERROR_CODE_IO_*` error the page itself opens in the browser after 4 s | `error` with the message |
| 20 | Ended | no centre glyph (ended is neither "not ready" nor buffering); the overlay stays up because the video is no longer playing-and-ready. The hub then plays the first Up next item, if any | `ended` |

- **Remote** (`handleRemote`, `player/PlayerLogic.kt:53`): OK or Play/Pause toggles; Play plays; Pause pauses; Left / Rewind back 10 s, Right / Fast-forward forward 10 s, growing to 30 s after 3 repeats and 60 s after 10 while held (`seekStepSec`); Up sends the video to the corner; Down opens the Up next tray (only with a queue); hold OK or Menu opens the sheet (screen 21); Back twice leaves (to screen 12). In the error state OK retries from the same position and Down opens the page. Every remote key stops at the player while it is full screen.
- **Claude's controls:** `control_playback(play|pause|seek)` arrives as a new `control.seq`; the player applies each seq once and shows the overlay. `stop` replaces the scene with idle, which closes the player.

## 21. Player actions sheet

- **Source:** `player/PlayerScreen.kt:321`, using `ActionSheet` (screen 6 for the look).
- **Copy:** title = the media title or host. Options: "Browse while it plays" (to the corner), "Send back to laptop" (`POST /sendback`, pauses the TV), "Start over" (seek to 0 and play).
- **Trigger:** hold OK or Menu during full-screen playback.

## 22. Up next tray

- **Source:** `player/PlayerScreen.kt:431` `UpNextTray`.
- **Layout:** a 300 dp (600 px) bottom scrim, transparent to black 85%; bottom-left column, padding 54 dp sides (48 + 6), 33 dp (27 + 6) top/bottom, 14 dp gaps: a row with "Up next" (`title`, `text`) and "OK plays it now · ▲ back to the video" (`caption`, `textTertiary`), 16 dp apart; then a row of `TvTile`s (screen 4, no progress bar), 18 dp apart, the first focused. Fades in and out over 200 ms; the controls overlay hides while it is open.
- **Remote:** Left/Right between tiles, OK plays that item now (`onPlayQueued`), Up or Back closes the tray; playback keys still work.
- **Trigger:** Down during playback when `queue` is not empty (`queue_media`, `POST /queue`). Closes itself if the queue empties.

## 23. Corner (mini) player

- **Source:** `ui/Browser.kt:250` (the player's box) and `:278` (the caption); slot rules `nextPlayerSlot`, `ui/Browser.kt:390`.
- **Layout:** the same player, 320 x 180 dp (640 x 360 px), bottom-right at the safe margins (48 dp right, 27 dp bottom), clipped to radius 16 dp. No overlay, no focus, no keys. Above it, "▶ Play for full screen" in `caption`, `textSecondary`, right-aligned at 60 dp from the right edge and 215 dp from the bottom (27 + 188).
- **Behind it:** the home for a video sent to the corner; the pushed card or link when a card or link interrupted playback.
- **Triggers:** Up in the full-screen player; "Browse while it plays" in its sheet; `POST /send` with `corner: true`; a card or link pushed while a video plays.
- **Remote:** Play or Play/Pause brings it back to full screen. A new idle, browser or app scene ends it.

## 24. YouTube / Twitch / Netflix hand-off

- **Source:** `ui/Browser.kt:127` (the `LaunchedEffect` on the scene); `apps/AppLaunch.kt:30` `appLaunch`, `:64` `launch`.
- **What happens:** for `open: "app"` the TV starts the streaming app with an `ACTION_VIEW` intent and draws nothing of its own. YouTube goes to SmartTube (stable, then beta) when installed, else YouTube for Android TV, with the URL normalised to `https://www.youtube.com/watch?v=<id>&t=<n>s`; Netflix to `com.netflix.ninja`; Twitch to `tv.twitch.android.app`.
- **States:** app launched: the other app is in front, tvdash keeps its hub socket while that app plays the scene, and steers it through the app's media session (`remote/AppSteering.kt`, needs notification access; no UI). App missing or the launch refused: the page opens in the in-app browser instead (screen 26). Coming back to tvdash shows screen 12.
- **Trigger:** `play_media` with a YouTube, Twitch or Netflix URL. Up next never advances from an app.

## 25. Browser start page

- **Source:** `ui/StartPage.kt:41` `StartPage`, `:79` `PageTile`; shown from `ui/TvBrowser.kt:771` when the browser opens on `about:blank` (`BROWSE_HOME`).
- **Layout:** full screen `ink`, padding 72 dp sides (48 + 24), 43 dp top/bottom (27 + 16), 20 dp gaps:
  - a row of `BarButton`s 12 dp apart: "Search or type an address" and, when there is history, "Clear history".
  - section "Bookmarks" then section "Recent" (each skipped when empty): the label in `eyebrow`, `textTertiary`, 10 dp, then at most 3 tiles 16 dp apart.
  - tile: a `GlassPanel` 240 x 124 dp (480 x 248 px), radius 24 dp, padding 18 dp, 6 dp gap: the page title (`callout`, `text`, 2 lines) and the host (`caption`, `textTertiary`). Focus: `glassFocused` fill and a spring scale to 1.04 (damping 0.7, stiffness 400), no ring.
- **Empty:** with no history and no bookmarks the address bar opens straight away (screen 27) over an empty start page.
- **Remote:** the first tile takes focus; OK opens it; "Search or type an address" opens the bar; Back closes the browser.

## 26. Browser: page view

- **Source:** `ui/TvBrowser.kt:157` `Browser`; overlays `LinkRing` `:986`, `PointerArrow` `:1000`, `Pill` `:1019`.
- **Layout:** full screen `ink` with an Android WebView filling it (ad and tracker blocking, HTTPS upgrade, pop-ups and permission prompts refused). On top:
  - **load progress:** a 3 dp `blue` bar along the top, as wide as the load percentage, while 1 to 99%.
  - **jump mode (default):** a `LinkRing` around the link, button or field the pointer is on: 3 dp `blue` border, radius 8 dp, 4 px outside the element.
  - **free pointer mode:** a 28 dp macOS-style arrow, white with a black outline (6% of its width); its tip is the click point. Also shown in jump mode when no link is ringed.
  - **hint pill**, top-right, for the first 4 s of each URL, fading out over 600 ms: "◀▲▼▶ next link · hold ▲▼ scroll · OK open · hold OK more" (jump mode) or "◀▲▼▶ move · OK click · Menu address & controls · Back" (free pointer).
- **Remote:** jump mode: arrows jump to the nearest link that way (none that way: Up/Down scroll half a screen and look again); holding Up/Down scrolls by an eighth of the screen. Free pointer: arrows move the pointer, faster while held, scrolling at the edges. OK (short) taps at the pointer; hold OK: quick actions (screen 28); Menu: the bar (screen 27); Play/Pause plays a found video directly. Back, one level at a time: numbered links, quick actions, panel, video question, web full screen, Shields, bar, start page closes the browser, then the page's own history, then closes the browser.
- **Triggers:** OK on a link or GitHub card; `play_media` with `open: "browser"`; a failed app hand-off; home Bookmarks tiles; the found-stream error fallback; `browse` messages (`input` or actions) and `type` messages with Enter from the phone or laptop; voice "go to …" or "search …". A new scene from the hub closes the browser ("the latest push always wins"). Pages that fail to load show the WebView's own error page (the app draws none).
- **Phone touchpad:** `touch` messages move this pointer, scroll, or click.

## 27. Browser: address and controls bar

- **Source:** `ui/BrowserBar.kt:50` `BrowserBar`, buttons `:129` `BarButton`.
- **Layout:** top-centre, full width inside the safe margins; radius 28 dp, `inkRaised` at 94%, 1 dp `hairline` border, padding 12 dp, 10 dp gap.
  - address field: full width pill, padding 28 x 14 dp. Unfocused `glass` fill with a `hairline` border; focused white 14% fill with a `blue` border. Text in `body`, `text`, `blue` cursor, single line, URI keyboard, Go action. Placeholder "Search with Brave or type an address" (`body`, `textTertiary`). Opens with the page's address fully selected (empty on the start page) or with typed text.
  - a row of `BarButton`s, 4 dp apart: "Back", "Forward" (each disabled at alpha 0.35 when not possible), "Reload", "Bookmark" / "Bookmarked", "Shields", "Desktop site" / "Mobile site", "Mouse off" / "Mouse on", a spacer, "Close". `BarButton`: pill, padding 12 x 10 dp, `callout`; unfocused transparent with `textSecondary` label; focused `text` fill with `ink` label; no ring.
- **Remote:** the address takes focus; Down goes to the buttons (landing on Reload); Left/Right along them; Up back; the on-screen keyboard types; Menu or Back closes the bar.
- **Search:** words that are not an address go to Brave Search (`https://search.brave.com/search?q=…`).

## 28. Browser: quick actions sheet

- **Source:** `ui/TvBrowser.kt:812`; options `ui/QuickActions.kt:16` `quickActions`; look as screen 6.
- **Copy:** title = the page title (else host). Options in order: "Bookmark this page" / "Remove the bookmark", "Bookmarks", "History", "Number the links", "Play the video directly" (only when a video was found), "Send to my laptop", "Bigger text", "Smaller text" (25% steps between 50% and 200%), "Free pointer (for maps)" / "Jump between links", "Show the blocked count" / "Hide the blocked count", "Reload".
- **Trigger:** hold OK on a page.

## 29. Browser: Bookmarks / History panel

- **Source:** `ui/LibraryPanel.kt:67` `LibraryPanel`, rows `:150` `LibraryRow`.
- **Layout:** full-screen black 60% scrim; a `GlassPanel` on the right, full height, 560 dp wide (1120 px) with 27 dp vertical and 48 dp end padding applied inside that width. Content padding 24 dp, 14 dp gaps:
  - tab row, 10 dp gaps: "Bookmarks" and "History" in `title`; the selected one `text` on a `glassFocused` pill (padding 16 x 6 dp), the other `textTertiary`; then "◀ ▶ switch · hold OK remove" in `caption`, `textTertiary`.
  - section headers in `eyebrow`, `textTertiary` (10 dp above, 6 dp below): history days "Today", "Yesterday", then e.g. "Monday 26 October"; for laptop bookmarks "From your laptop's TV folder".
  - row: radius 14 dp, padding 14 x 10 dp, 14 dp gaps: a 40 dp circle in the URL's ground colour with the host's first letter (`callout`); the title (`callout`, `text`, one line) over the host, plus " · HH:mm" (always 24-hour) for history (`caption`, `textTertiary`). Focused: `glassFocused` fill, ring corner 14 dp, lift 1.02.
- **Empty states:** "No bookmarks yet. Hold OK on a page and pick Bookmark." and "Nothing visited yet." (`callout`, `textSecondary`).
- **Remote:** Left/Right switch the tab; Up/Down move; OK opens; hold OK removes (forgets a history entry; unbookmarks; laptop bookmarks cannot be removed here); Back closes.

## 30. Browser: Shields panel

- **Source:** `ui/ShieldsPanel.kt:33` `ShieldsPanel`.
- **Layout:** top-right inside the safe margins, 560 dp wide, radius 28 dp, `inkRaised` at 96%, 1 dp `hairline` border, padding 28 dp, 12 dp gaps. Header: a 12 dp dot (`green` when up, `textTertiary` when down) and "Shields up for `<site>`" / "Shields down for `<site>`" ("Shields up" for pages without a site) in `title`, `text`.
- **Copy (all `callout`, `textSecondary`):** when up: "`<n>` ads and trackers blocked" (singular "1 ad or tracker blocked"), "`<n>` scripts blocked", "`<n>` ad elements hidden"; when down: "Ads and trackers are allowed on this site."; always "`<n>` redirects stopped". Buttons: "Turn Shields off for this site" / "Turn Shields on for this site" (focused first; reloads the page), "Hide the blocked count" / "Show the blocked count".
- **Trigger:** "Shields" in the bar. Menu or Back closes it.

## 31. Browser: "Video found on this page" sheet

- **Source:** `ui/TvBrowser.kt:870`.
- **Copy:** title "Video found on this page"; options "Play it directly" (sends the stream to the TV's player with the page as `referer`) and "Stay on the page".
- **Trigger:** once per page, the first time the page loads a stream the TV's player can play (not on the start page).

## 32. Browser: numbered links

- **Source:** `ui/TvBrowser.kt:971` `LinkNumber`, `numberLinks` `:334`.
- **Look:** up to 99 numbers in reading order, each on the top-left corner of its link: `caption` in `ink` on an `orange` tag, radius 6 dp, 5 dp side padding.
- **Trigger:** quick action "Number the links", voice "show links", "open `<n>`". Any arrow or Back removes them. A missing number shows the notice "No link `<n>` on screen".

## 33. Browser: pills

- **Source:** `ui/TvBrowser.kt:1019` `Pill` and its call sites `:793` to `:948`.
- **Look:** a pill on `ink` at 80%, padding 14 x 7 dp, text in `caption`, `textSecondary`; "shield" pills add an 8 dp `green` dot. The pill applies the safe margins itself (some call sites add another `padding`, so those sit at double margins).

| Pill (exact copy) | Position | When, how long |
|---|---|---|
| hint, see screen 26 | top-right | first 4 s of a URL |
| notice: "Bookmarked", "Bookmark removed", "Sent to your laptop: it opens there within 30 s", "Text at `<n>`%", "Mouse mode: the arrows move a pointer anywhere", "The arrows jump between links", "No link `<n>` on screen", "No video found on this page" | top-centre | 2.5 s |
| "Presenting from your laptop" | top-left | while `present` messages arrive (cleared after `PRESENT_TIMEOUT_MS`) |
| "▶❙❙ plays this page's video directly" | bottom-left | a video was found and the question is not up |
| "Stopped a redirect to `<site>`" (shield) | bottom-left | 5 s after a cross-site redirect is refused |
| "`<n>` blocked" (shield) | bottom-right | anything blocked on the page, the count is switched on, Shields closed |

- **Presenter's pointer:** with `present` carrying `pointer`, a 28 dp `orange` dot at 85% marks the laptop's pointer.

## 34. Browser: web video full screen

- **Source:** `ui/TvBrowser.kt:746` (`onShowCustomView`) and `:373` (auto full screen).
- **What shows:** the page's own full-screen video view fills the screen (Chromium's controls, not the app's). The browser taps a playing video and asks for full screen on its own after about 2 s, because inline video is slow on this TV. Back leaves full screen first.

## 35, 36. Steps

- **Source:** `ui/Steps.kt:98` `StepsScene`, `:156` `TimerRing`; key map `stepAction` `:48`; progress kept in `TvdashApp` so timers outlive the screen.
- **Layout:** fills the scene area, 24 dp gaps, focusable:
  - header row, 16 dp gaps: the scene title (`callout`, `textSecondary`, one line) and a row of segments, one per step, 28 x 6 dp, radius 3 dp, 6 dp apart: `orange` up to and including the current step, `glassFocused` after.
  - body row, 48 dp gap: left column, 18 dp gaps: "Step `<n>` of `<N>`" in `title`, `orange`; the step text in `hero`, `text`, 4 lines; optional detail in `body`, `textSecondary`, 4 lines. Right (only for a step with `timerSec`): the timer ring.
  - footer in `caption`, `textTertiary`, joined with " · ": "OK next step" (or "Back when you're done" on the last step), "◀ previous" (after the first), "▶❙❙ starts the timer" / "▶❙❙ pauses the timer", "⏩ +1 min" (timer steps).
- **Timer ring:** 220 dp (440 px); track a full circle in `glassFocused`, 14 dp stroke; the remaining fraction as an `orange` arc from 12 o'clock, round cap. Centre: the time left in `hero` ("4:00", "0:09", rounded up so 0:00 shows only at the end) over "running" or "paused" in `caption`, `textTertiary`. Redrawn 4 times a second.

| State | Ring | Label |
|---|---|---|
| no timer | not drawn | footer without timer hints |
| ready (not started) | full | "paused" (there is no separate "ready" word) |
| running | shrinking | "running" |
| paused | frozen | "paused" |
| finished | reset to 0:00, empty | "paused"; plus screen 37 |

- **Remote:** OK or Right next (stays on the last step), Left previous, Play / Pause / Play-Pause start or pause this step's timer, Fast-forward adds a minute. Back goes home; timers keep running.
- **Trigger:** `show_steps(title, steps, sourceUrl?)`, `POST /steps`. `sourceUrl` is not drawn anywhere on the TV.

## 37. Steps: timer done banner and chime

- **Source:** `ui/Browser.kt:156` (timer), `:354` (banner), `:373` `chime`.
- **Look:** a pill `GlassPanel`, top-centre at 35 dp from the top (27 + 8), padding 28 x 14 dp: "Timer done: `<step text>`" ("Your timer" when the steps scene is gone) in `title`, `text`. Drawn over everything (player, browser, wall). Shown for 15 s.
- **Sound:** a `ToneGenerator` beep (`TONE_PROP_BEEP2`, 1.5 s) on the notification stream, at volume 100.
- **Note:** the voice banner (screen 42) uses the same position and is drawn after, so the two can overlap.

## 38, 39, 40. The wall

- **Source:** `ui/Wall.kt:138` `WallScreen`, tiles `:207` `WallTile`, pictures `:122` `PinPicture`, columns `:89` `wallColumns`.
- **Grid (38):** full screen `ink`, safe padding. Header row, bottom-aligned, 20 dp gaps: clock in `hero`, the date in `callout`, `textSecondary` (fills), "OK full screen · hold OK unpin · Back home" in `caption`, `textTertiary`. 20 dp, then a grid: 1 column for 1 pin, 2 for up to 4, 3 for up to 9, 4 beyond; 24 dp gaps, 10 dp padding; picture height shared so every row fits (minimum 80 dp). Tile: the picture (fitted whole on `inkRaised`, radius 16 dp), 8 dp, then the pin title (`callout`, `text`) and its age (`caption`, `textTertiary`, "just now", "12 min ago"). Focus ring corner 16 dp, lift 1.03. Before a picture loads, the pin title in `callout`, `textTertiary` stands in.
- **One pin (39):** a header with the title (`title`, `text`) and "`<age>` · Back to the wall" (`caption`, `textTertiary`), 16 dp, then the picture filling the rest, fitted, radius 16 dp.
- **Unpin sheet (40):** `ActionSheet` titled with the pin title: "Unpin", "Keep it".
- **Triggers:** toolbar "The wall", the Pins row on home, or **5 minutes without a key on home** while pins exist. Closes by itself when the last pin goes. Pins come from the browser extension (`POST /pins`).
- **Remote:** D-pad between tiles, OK full screen, hold OK the sheet, Back from one pin to the grid, then home.

## 41. Pair a device

- **Source:** `ui/Pairing.kt:76` `PairScreen`, rows `:190` `DeviceRow`; network `hub/HubAuth.kt` (`HubPairing`).
- **Layout:** full screen `ink`, safe padding, a row 40 dp apart:
  - left (fills), 18 dp gaps: "Pair a device" in `hero`, `text`; "Type the code in the tvdash extension, tvdash pair or Claude's sign-in page, or scan it with your phone." in `callout`, `textSecondary`; when a code exists, a row 24 dp apart: the six digits spaced "123 456" (Inter Display Light 72 / 80 sp = 144 / 160 px, one line) over "Works for `<m:ss>`, once" (`callout`, `textTertiary`, counting down each second), and a QR (168 dp = 336 px) of `<hub>/remote#pair=<code>`; an orange `callout` problem line when a call failed; when the hub counted unpaired requests, "`<n>` requests without a device token today: pair the devices that sent them before auth goes on." (`callout`, `textSecondary`); "Back closes this and ends the code" (`caption`, `textTertiary`).
  - right, 340 dp wide, 12 dp gaps: "Paired · hold OK to unpair" in `eyebrow`, `textTertiary`; a list, 6 dp apart: device name (`callout`, `text`) over "`<kind>` · seen `<relative time>`" (`caption`, `textTertiary`). Row: radius 14 dp, padding 16 x 10 dp, focused `glassFocused` fill, ring corner 14 dp, lift 1.02.
- **Device kinds:** "This TV", "Browser extension", "Command line", "Couch mode helper", "Phone remote", "Claude Code", "Claude app", "iPhone Shortcut", else the raw kind.
- **States:** waiting for a code (title, instructions and footer only); code shown and counting down (renewed when it expires, and after a new device pairs because a code works once); problem shown, e.g. "Can't reach the hub: `<reason>`", "This TV doesn't own the hub, so it can't pair devices. (`<error>`)", or "The hub answered `<code>`." (retried every 10 s); device list empty (only the header); unpaired-requests warning (hub `AUTH_MODE: warn`).
- **Remote:** focus starts on the first device; Up/Down between devices; hold OK (or Menu) unpairs one (never the TV itself); Back closes and ends the code. The list refreshes every 3 s.
- **Trigger:** toolbar "Pair a device". There is no separate "unpaired" or "auth refused" screen for the TV itself: the daily build claims the hub silently at start (`MainActivity.kt:159`) and failures only go to logcat.

## 42. Voice banner

- **Source:** `ui/Browser.kt:290` (replies) and `:359` (banner); recognizer `remote/VoiceInput.kt:27`; commands `remote/Voice.kt` `voiceCommand`, `browser/BrowserVoice.kt` (`reply`).
- **Look:** a pill `GlassPanel`, top-centre at 35 dp from the top, padding 26 x 12 dp, one line in `callout`, `text`. Over every screen.
- **States and copy:**
  - listening, browser closed: "Listening… say "pause", "next" or "play" and a title".
  - listening, browser open: "Listening… say "show links", "open 3", "go to" a site or "scroll down"".
  - TV commands (4 s): "Pausing", "Playing", "Stopping", "Next in Up next", "Home", "Playing `<title or url>`".
  - not understood (4 s): "Didn't understand "`<words>`". Questions for Claude go from your laptop."
  - browser commands (4 s): "Numbering the links: say "open" and a number", "Opening link `<n>`", "Going to `<input>`", "Searching for `<query>`", "Back", "Forward", "Reloading", "Scrolling down", "Scrolling up", "To the top", "Bookmarking this page", "Your bookmarks", "Your history", "Playing the page's video", "The page's video", "Mouse mode on", "Mouse mode off".
  - failures (4 s): "This TV has no speech recognition", "Didn't catch that", "The mic isn't working (`<error code>`)", "The mic is off for tvdash (Settings › Apps › tvdash › Permissions)".
- **Also:** the first press shows Android's own microphone permission dialog (system UI, not the app's).
- **Trigger:** the remote's mic key, toolbar "Voice".

## 43. Keys, typing, touch and volume from the hub

These change what is on screen without screens of their own:

- **`key`** (`POST /key`, the extension's D-pad): injected as real key events (`MainActivity.kt:97`), so focus rings and every screen's rules above apply. No extra feedback is drawn.
- **`type`** and **`browse`**: into the browser's focused field or its address bar (screen 27); with the browser closed, text opens the browser start page with the bar holding the text, Enter opens it.
- **`touch`**: moves the browser pointer (screen 26).
- **`volume`**: changes the media volume and lets Android draw its own volume bar (`remote/TvVolume.kt`, `ADJUST_*` with the show-UI flag); no tvdash UI.
- **`present`**: the browser follows the laptop's scroll and shows the presenting pill and dot (screen 33).

## Things the protocol names that have no TV screen

- **`run_scene`**: the hub runs the named scene's `clear`, `send` and `queue` steps; the TV only sees the resulting idle and media scenes.
- **`get_screen`**: nothing changes on the TV.
- **`queue_media`**: no screen of its own; it shows as the toolbar badge (screen 5), the player's Up next line (18) and the tray (22). Added while idle, it plays at once.
- **Schedules** (`POST /schedule`): run on the hub; the TV sees ordinary scenes.

## Unclear or not found

- **No disconnected, offline or loading screen.** Before the first message the TV draws the idle screen with "Connecting…"; after a drop it keeps the last scene with "Reconnecting…". No splash or loading state exists for the app itself.
- **No pairing-required, unpaired or auth-refused screen for the TV.** A 401 or 403 on the socket only shows as "Reconnecting…" in the pill; claim failures go to logcat (`hub/HubAuth.kt:87`). Only the Pair a device screen shows hub errors.
- **No "update the TV" screen.** A state message with `v` other than 1 is ignored (`decodeServerMessage`, `protocol/Protocol.kt:219`); the TV keeps what it showed. `PROTOCOL.md` says a higher `v` "means the TV needs an update", but nothing tells the viewer.
- **Media still drawn as a link card.** `ui/TvdashScreen.kt:92` keeps the old placeholder comment; screen 12 is what the viewer sees behind or after the player. Whether this is intended or leftover is not stated.
- **Ended player state** (screen 20) is inferred from the overlay's conditions; there is no explicit "ended" design.
- **Ready step timer** reads "paused" before it was ever started; there is no distinct "ready" label. A finished timer reads "0:00 paused".
- **Card footer** always reads "From Claude", whatever sent the card. The link card too.
- **`sourceUrl`** of steps is never drawn on the TV.
- **`checksVerdict`** (Passing, Running, Failing) exists in `ui/Github.kt:48` but no screen draws it.
- **Spinner stroke** is 6 px and its inset 4 px (written without dp), so it does not scale with density like everything else.
- **Pill margins:** `Pill` already pads by the safe margins; "Presenting from your laptop" adds `padding(Spacing.safeHorizontal)` and the notice adds a top padding, so those sit further in. Whether that is intended is unclear.
- **Timer and voice banners** share one position and can overlap.
- **Font scale:** sp to px assumes Android's default font scale of 1.0; the TV's actual setting is unknown.
- **Pin pictures** are only as good as the extension's crops; the app shows only the pin title while loading and has no failed-to-load state beyond that text.
- **WebView error pages, Android's volume bar, the microphone permission dialog and the streaming apps** are system or third-party UI, not designed in this app.
- Not opened in detail (no UI): ad-block lists and filters (`browser/NetworkFilters.kt`, `FilterEngine.kt`, `CosmeticFilters.kt`), stream detection (`browser/Streams.kt`), app steering (`remote/AppSteering.kt`). A grep for `Text(` in `remote/`, `browser/`, `hub/` and `apps/` found none.
