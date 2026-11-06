---
sidebar_position: 21
slug: /tvdash-phone-screens
---

# tvdash: the phone and browser pages, as built

This is an inventory of every page and state that tvdash draws for a person who is not looking at the TV: the phone remote, the Claude sign-in page, the browser extension (popup, options, home page and the UI it puts into pages), the iPhone Shortcut, and the CLI's terminal output. It describes what the code in `/Users/yab/Hobby/tvdash` does today. It is not a design. Each item gives the source as `path:line`, relative to that checkout.

Facts that apply throughout:

- The hub is a Cloudflare Worker (`hub/src/index.ts`). Every page calls its JSON routes on the same origin (the phone remote) or on the configured hub URL (the extension, the CLI).
- `AUTH_MODE` is `"on"` in `hub/wrangler.jsonc:10`. Any device that is not paired gets a 401 with `"This device is not paired with the TV. On the TV, open Pair a device and enter its code here."` (`hub/src/auth.ts:67`). Every client below shows a pairing state because of this.
- The TV's own screens (including the TV-side **Pair a device** screen that shows the code and the QR) are not covered here. They live in `tv/app/src/main/kotlin/dev/tvdash/ui/`.

## Index

| # | Page or state | File | Viewport | Purpose |
|---|---|---|---|---|
| 1 | Remote: shell, header, connection pill | `hub/src/remote.html:482` | phone (under 880 px wide) and desktop (880 px and wider, max 1080 px) | Brand mark and hub connection state |
| 2 | Remote: "Can't reach the hub" banner | `hub/src/remote.html:491` | same | Offline warning |
| 3 | Remote: pair panel (unpaired) | `hub/src/remote.html:496` | same | Type the TV's six digits |
| 4 | Remote: QR pairing (scanned `#pair=`) | `hub/src/remote.html:2237` | same | Pair with no typing |
| 5 | Remote: Now playing card, scene states | `hub/src/remote.html:513`, `:1146` | same | What the TV shows |
| 6 | Remote: Now playing, player states and controls | `hub/src/remote.html:526`, `:1175` | same | Play, pause, seek, stop |
| 7 | Remote: Now playing, live stream | `hub/src/remote.html:174`, `:1225` | same | LIVE badge, no seeking |
| 8 | Remote: Now playing, offline and stale | `hub/src/remote.html:1199`, `:1254` | same | Last known state, stale report |
| 9 | Remote: phone lock screen and control centre | `hub/src/remote.html:1400` | OS media UI | Steer the video while the phone is locked |
| 10 | Remote: D-pad (Remote panel) | `hub/src/remote.html:560` | same | TV remote buttons |
| 11 | Remote: volume row | `hub/src/remote.html:576` | same | TV volume and mute |
| 12 | Remote: TV browser panel | `hub/src/remote.html:586` | same | Address bar, page actions, back and forward, mouse mode |
| 13 | Remote: address suggestions | `hub/src/remote.html:608`, `:1838` | same | Matches from the TV's bookmarks and history |
| 14 | Remote: touchpad panel | `hub/src/remote.html:620` | touch devices only | Pointer, click and scroll for the TV browser |
| 15 | Remote: touchpad keyboard form | `hub/src/remote.html:638` | same | Type into what was clicked |
| 16 | Remote: "Bookmark what's on the TV" | `hub/src/remote.html:636`, `:1761` | same | Bookmark the page or video on screen |
| 17 | Remote: History and bookmarks panel | `hub/src/remote.html:650`, `:1775` | same | Open a page from the TV's lists |
| 18 | Remote: Library panel | `hub/src/remote.html:554`, `:1024` | same | The TV home's rows, replay and remove |
| 19 | Remote: Send to TV form and result | `hub/src/remote.html:665`, `:1495` | same | Paste a link to play or queue |
| 20 | Remote: share-sheet setup (iPhone and iPad) | `hub/src/remote.html:688`, `:1594` | iOS only | Install the Play on TV Shortcut |
| 21 | Remote: arrival from the Android share sheet | `hub/src/remote.html:2244` | Android installed app | Send a shared link at once |
| 22 | Remote: Type on the TV panel | `hub/src/remote.html:699` | same | Send text to the TV browser |
| 23 | Remote: Up next panel | `hub/src/remote.html:714`, `:996` | same | The queue |
| 24 | Remote: Recent activity panel | `hub/src/remote.html:722`, `:1274` | same | The last 8 tool calls |
| 25 | Remote: bottom tab bar | `hub/src/remote.html:729`, `:1913` | phone only | Switch between the 5 sections |
| 26 | Remote: keyboard bar (field focused on the TV) | `hub/src/remote.html:739`, `:2048` | fixed, max 560 px | Mirror typing into the TV's field |
| 27 | Remote: toast | `hub/src/remote.html:753`, `:1315` | fixed, max 440 px | Short confirmations and errors |
| 28 | Remote: installed web app (manifest and icon) | `hub/src/remote.ts:10`, `hub/src/icon.ts:10` | home screen | Install and share target |
| 29 | iPhone "Play on TV" Shortcut | `hub/scripts/shortcut.mjs:43` | iOS share sheet | Send from YouTube or Safari |
| 30 | Claude sign-in (`/authorize`), default | `hub/src/oauth.ts:57` | `min(420px, 100vw - 32px)`, centred | Connect a Claude app with the TV's code |
| 31 | Claude sign-in, error | `hub/src/oauth.ts:82`, `:114` | same | Wrong or missing code |
| 32 | Extension popup: header and connection | `extension/popup.html:9` | 380 px wide | Brand, connection, Home, Options |
| 33 | Extension popup: pair section | `extension/popup.html:20` | same | Pair this browser |
| 34 | Extension popup: "Video found on this page" | `extension/popup.html:29` | same | Play the stream behind the page |
| 35 | Extension popup: On the TV now | `extension/popup.html:37` | same | What the TV shows, with controls |
| 36 | Extension popup: Send this tab | `extension/popup.html:58` | same | Send the tab five ways, with Undo |
| 37 | Extension popup: Pins and Present | `extension/popup.html:76` | same | Pin part of a page, present the tab |
| 38 | Extension popup: Couch mode | `extension/popup.html:92` | same | Ask Claude (through the helper) to turn the page into TV content |
| 39 | Extension popup: Remote and type box | `extension/popup.html:105` | same | D-pad, keyboard as remote, typing |
| 40 | Extension popup: Up next | `extension/popup.html:124` | same | The queue |
| 41 | Extension options page | `extension/options.html:18` | at least 360 px, in the extensions dialog | Hub URL, test, pairing |
| 42 | Extension home page | `extension/home.html:10` | max 1280 px, one breakpoint at 600 px | The TV at a glance: scenes, schedule, library |
| 43 | In-page "Play on TV" chip | `extension/content.js:10` | fixed over any page's video | Send the video at its current time |
| 44 | In-page element picker | `extension/picker.js:4` | overlay on any page | Pick an element to pin |
| 45 | Presenting a tab | `extension/picker.js:83`, `extension/background.js:158` | no UI (badge only) | The TV follows the laptop's scroll |
| 46 | Toolbar badge and tooltip | `extension/background.js:402` | toolbar icon | Result of a send |
| 47 | Right-click menu | `extension/background.js:227` | context menu | Send a link, video, image, page or text |
| 48 | Send-back (a new tab opens) | `extension/background.js:313` | new tab | Continue on the laptop what the TV played |
| 49 | CLI help and usage errors | `cli/tvdash:11`, `:266` | terminal | Usage |
| 50 | CLI command output | `cli/tvdash:160` | terminal | Results of each command |
| 51 | CLI `status` | `cli/tvdash:276` | terminal | What the TV shows |
| 52 | CLI errors | `cli/tvdash:139` | terminal | Hub refused or unreachable |
| 53 | Couch-mode helper messages | `helper/server.mjs:34`, `extension/couch.js:12` | no page; text in the popup | Helper status |

That is 53 pages and states. The phone remote is one HTML file whose sections are all on one page; at phone width a tab bar shows one group at a time (item 25).

---

## Phone remote (`GET /remote`)

**Source:** `hub/src/remote.html`, served by `hub/src/remote.ts:39` with `Cache-Control: no-cache`. One self-contained file: inline CSS (lines 20 to 447), an inline SVG sprite (lines 450 to 480), markup (482 to 753), and one script (755 to 2265). Fonts come from Google Fonts (Inter 400, 500, 600, 700, `remote.html:19`).

**Meta** (`remote.html:5` to `16`): `width=device-width, initial-scale=1, viewport-fit=cover`; title `"tvdash remote"`; description `"Control what plays on the TV."`; `theme-color` `#05060A`; `color-scheme: dark`; Apple web-app capable, status bar `black-translucent`, app title `"tvdash"`; manifest `/remote/manifest.webmanifest`; icons `/remote/icon.svg` and `/remote/icon-180.png`.

**Viewports and layout** (`remote.html:71` to `107`, `424` to `445`):

- `.wrap`: `max-width: 1080px`, centred. Padding `calc(14px + safe-area-top)` top, `16px + safe-area` left and right, `28px + safe-area-bottom` bottom.
- **Phone, under 880 px wide** (`@media (max-width: 879px)`): one column (`.grid` and `.col` gap 14 px). Only the sections of the current tab show (`[data-tab-of].off { display: none }`). A fixed tab bar sits at the bottom, and `.wrap` gets `96px + safe-area` bottom padding so it does not cover content. The Send and Type forms put the field on its own row with the buttons below in two equal columns (`remote.html:443`).
- **Desktop, 880 px and wider:** two columns, `minmax(0, 1.15fr) minmax(0, 1fr)`, gap 20 px. Top padding 28 px, header margin-bottom 24 px, panel padding 26 px. Every section shows at once. Left column: Now playing, Library, Remote. Right column: TV browser, Touchpad, History and bookmarks, Send to TV, Type on the TV, Up next, Recent activity (`remote.html:512` to `726`).
- `@media (hover: hover) and (pointer: fine)` hides the Touchpad panel entirely (`remote.html:365`). A laptop with a mouse never sees it.
- `@media (prefers-reduced-motion: reduce)` turns every transition off (`remote.html:446`).
- Background: body `#05060A` (`--bg`), plus a fixed `body::before` with three radial glows: blue `rgba(10,132,255,0.22)` at 12% / -8%, indigo `rgba(94,92,230,0.20)` at 105% / 28%, purple `rgba(191,90,242,0.12)` at 30% / 112% (`remote.html:53`).
- Panels are `.glass` (`remote.html:108`): background `rgba(255,255,255,0.08)`, 1 px border `rgba(255,255,255,0.18)`, radius 28 px, `backdrop-filter: blur(28px) saturate(150%)`, shadow `0 20px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)`. Padding 20 px (26 px on desktop).
- Panel headings `h2` (`remote.html:120`): 13 px / 600, uppercase, `letter-spacing: 0.06em`, colour `--text-3`, margin-bottom 14 px.

**Data flow:** the page polls `GET /status` every 1500 ms while visible (`POLL_MS`, `remote.html:759`), backs off to `1500 × 2^fails` up to 10 s on failure, and stops polling when the tab is hidden, unless the lock-screen widget is active (`remote.html:899`). Each request times out after 5 s. After a poll it refreshes `GET /browsing` if its copy is older than 5 s (`remote.html:895`). A 250 ms timer re-renders the scene and the clock (`remote.html:1307`). The touchpad and keyboard bar use a WebSocket to `/touch`, opened at start and whenever a TV page is open, and closed while the page is hidden (`remote.html:1941`, `2035`). Auth is the `tvdash_device` cookie (HttpOnly, Secure, SameSite=Strict, a year, `hub/src/pair.ts:36`); the page script never sees the token.

### 1. Shell, header and connection pill

`remote.html:483` to `489`, logic `remote.html:1139`.

- Header: flex, space-between, gap 12 px, margin `4px 2px 16px`.
- Brand: a 32 × 32 px inline SVG, radius 9 px, filled with the `#g-mark` gradient `#0A84FF` to `#5E5CE6`, with a white play triangle. Then `"tvdash"` at 19 px / 700, `letter-spacing: -0.01em`, and `"remote"` in a `small` at 15 px / 500, `--text-3`.
- Connection pill (`.pill`, `remote.html:80`): height 30 px, padding `0 12px`, radius 999 px, glass background and hairline border, 13 px / 500, `--text-2`. An 8 px dot, then the text. `role="status" aria-live="polite"`.

| State (`data-conn`) | When | Text | Dot |
|---|---|---|---|
| `wait` | no answer yet, no failure | `"Connecting"` | `--text-3` |
| `ok` | last poll succeeded | `"Connected"` | `--green` with glow `0 0 10px rgba(48,209,88,0.7)` |
| `retry` | one failure | `"Reconnecting"` | `--orange` |
| `down` | two or more failures | `"Hub unreachable"` | `--red`; text `#FFB4AE`, border `rgba(255,69,58,0.45)` |

The document title becomes `"<title> · tvdash"` while the TV shows something other than idle, else `"tvdash remote"` (`remote.html:1186`).

### 2. "Can't reach the hub" banner

`remote.html:491` to `494`, CSS `remote.html:92`. Shown when the pill is `down`.

- Copy: **"Can't reach the hub."** then `" Showing the last known state; retrying in the background."`
- Style: flex, gap 10 px, padding `12px 14px`, radius 18 px, background `rgba(255,69,58,0.12)`, border `rgba(255,69,58,0.4)`, text `#FFD3CF`, 14 px. Alert-triangle icon (`#i-alert`) 20 px in `--red`. `role="alert"`.
- Sits above the grid on every tab.

### 3. Pair panel (unpaired)

`remote.html:496` to `509`, logic `remote.html:2208` to `2242`.

- Shown when `GET /status` answers 401 (`remote.html:879`), or when `GET /devices/me` answers 401 at start (`remote.html:2242`, so it shows even if the hub did not refuse). Hidden after a successful pair. It sits above the grid on every tab, with `margin: 0 16px 16px` (`.pair-panel`).
- Heading: `"Pair this phone with the TV"`.
- Note (`.pair-note`, `--text-2`, margin `6px 0 14px`): `"On the TV, open Pair a device on the toolbar and scan its code with this phone's camera, or type the six digits here."` (**Pair a device** in bold).
- Installed (standalone) variant (`remote.html:1909`): `"On the TV, open Pair a device on the toolbar and type its six digits here. The app pairs once, on its own."` The reason in the code: a home-screen app has its own cookie jar, and the camera opens a scanned code in the browser, not in the app.
- Form row (`.send-row`, grid `minmax(0,1fr) auto auto`, gap 10 px): a `.field` with the TV icon (`#i-tv`), the input `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="7"`, placeholder `"123 456"`, `enterkeyhint="go"`; then a primary button `"Pair"` with an arrow icon.
- Action: `POST /pair/claim {code, name, kind: "phone"}`. The name is `"iPad"`, `"iPhone"`, `"Android phone"` or `"Phone remote"`, from the user agent (`remote.html:2210`).
- Messages (toasts):
  - not six digits: `"Type the six digits the TV shows."` (error)
  - success: `"Paired. This phone is a remote for the TV now."`
  - no network: `"Couldn't reach the hub. Check your connection."` (error)
  - from the hub (`hub/src/screen.ts:378` to `386`): `"The TV is not showing a pairing code. Open Pair a device on the TV."`, `"That is not the code on the TV."`, `"Too many wrong codes. Open Pair a device on the TV again for a new one."`

### 4. QR pairing (scanned `#pair=`)

`remote.html:2237` to `2240`. The TV's QR code opens `{hub}/remote#pair=123456` (`docs/auth.md:31`). The page removes the fragment from the address bar first, then claims with that code, with the same toasts as item 3. There is no separate screen. The page loads, a toast says it paired, and the pair panel never appears.

### 5. Now playing card: scene states

Markup `remote.html:513` to `552`; text from `describe()` at `remote.html:1146`; tab `remote`.

- Top row (`.np-top`, margin-bottom 18 px): a kind chip on the left and a state label on the right.
  - Chip (`.chip`): height 28 px, padding `0 11px 0 9px`, radius 999 px, background `rgba(255,255,255,0.12)`, 13 px / 600, `--text`, 16 px icon.
  - State (`.state`): 13 px / 600, a 7 px dot, tones listed below.
- Main row (`.np-main`, gap 16 px): artwork tile then text.
  - Artwork (`.art`): 64 × 64 px, radius 18 px, a 30 px white icon, gradient by kind.
  - Title (`.np-title`, an `h1`): 21 px / 700, `letter-spacing: -0.015em`, line-height 1.22, clamped to 2 lines.
  - Subtitle (`.np-sub`): 14 px, `--text-2`, one line with ellipsis.

What the phone counts as "on screen" (`shown()`, `remote.html:928`): the TV browser's open page wins over the scene when it was opened after the scene, or when the scene is idle.

| Scene | Chip icon and label | Art gradient (`data-kind`) | Title | Subtitle |
|---|---|---|---|---|
| no data yet | moon, `"Idle"` | idle: glass `rgba(255,255,255,0.12)`, no shadow, icon `--text-2` | `"Connecting to the hub"` | blank |
| `idle` | moon, `"Idle"` | idle | `"Nothing on screen"` | `"The TV shows its clock"` |
| `card` | card, `"Card"` | `#F59E0B` to `#EA580C`, shadow `0 10px 30px rgba(245,158,11,0.2)` | card title | card body |
| `link` | link, `"Link"` | same orange | title, else `"owner/repo #N"` for GitHub, else host | host |
| TV browser page | globe, `"Browser"` | `#0FA3B1` to `#2563EB`, shadow `rgba(15,163,177,0.25)` | page title or host | `"<host> · in the TV's browser"` |
| `media`, player | tv, `"Player"`; art shows a solid play icon | default `#1B5FD9` to `#5E5CE6`, shadow `0 10px 30px rgba(10,132,255,0.3)` | title, else the file name from the URL | host |
| `media`, app | apps grid, `"YouTube app"`, `"Twitch app"`, `"Netflix app"` or `"App app"` | `#E0245E` to `#8E44AD`, shadow `rgba(224,36,94,0.25)` | title or host | `"<host> · in the <App> app"` |
| `media`, browser | globe, `"Browser"` | teal-blue | title or host | `"<host> · in the TV's browser"` |
| any other type (for example `steps`) | moon, the raw type (for example `"steps"`) | idle | `"Something new on screen"` | blank |

State label (`remote.html:1188` to `1202`, tone colours at `remote.html:131`):

| Condition | Text | Tone |
|---|---|---|
| no data, no failure | `"Loading"` | none (`--text-2`) |
| no data, failures | `"Offline"` | none |
| steerable video, `loading` | `"Loading"` | blue: text `#64B5FF`, dot `--blue` |
| `buffering` | `"Buffering"` | orange `--orange` |
| `playing` | `"Playing"` | green `--green` |
| `paused` | `"Paused"` | none |
| `ended` | `"Ended"` | none |
| `error` | `"Error"` | red `--red` |
| steerable but no report yet | `"Waiting for the TV"` | blue |
| media that is not steerable (app or browser without a fresh report) | `"Handed off"` | blue |
| `idle` | `"Idle"` | none |
| card, link or TV browser page | `"On screen"` | green |

Explanatory note under the controls (`.note`, `remote.html:248` and `1217`): 13.5 px, `--text-2`, centred, margin-top 16 px. It is hidden when empty.

- idle: `"Nothing is playing on the TV. Send a video below and the controls light up."`
- TV browser, no video reporting: `"Steer the TV browser from the Touchpad and Browse tabs. A playing video gets controls here."`
- card or link: `"The TV shows a card, not a video. Send a video to use the controls."` (or `"a link"`)
- app, not reporting yet: `"Opening in the YouTube app. The controls light up once it plays; if they never do, allow tvdash notification access on the TV."` (`"streaming"` when the app is unknown)
- browser media, not reporting: `"Opened in the TV's browser. The controls light up once its video plays."`
- player error: `"The player reported an error: <error or 'unknown'>."`
- live: `"Live stream: seeking is off."`

### 6. Now playing: player states and controls

`remote.html:526` to `551`, `1204` to `1231`, `1324` to `1398`.

A video counts as steerable (`isPlayer()`, `remote.html:943`) when it is in the TV's player, or when it is in an app or the TV browser and the TV reported on it less than 8 s ago (`REPORT_FRESH_MS`).

- **Timeline** (shown only while steerable), margin-top 20 px:
  - Range input, 36 px tall. Track 6 px, radius 3 px, filled `--text` up to the position and `rgba(255,255,255,0.18)` after it (CSS variable `--p`). Thumb 20 px white circle, shadow `0 2px 10px rgba(0,0,0,0.45)`, scale 1.25 while pressed. Disabled at opacity 0.4.
  - Times row: elapsed on the left (`"0:00"`), remaining on the right as `"−M:SS"` (U+2212 minus); 13 px / 500, `--text-2`, tabular numbers. Format `M:SS`, or `H:MM:SS` from one hour (`remote.html:823`).
- **Controls row** (`.controls`): centred, gap `clamp(18px, 7vw, 36px)`, margin-top 18 px.
  - `"Back 10 seconds"` (aria label): 64 px circle, background `rgba(255,255,255,0.12)`, hairline border, 30 px circular-arrow icon with a 7 px / 700 `"10"` inside.
  - Play or pause: 84 px circle, `--blue` with shadow `0 12px 36px rgba(10,132,255,0.45)`, white 36 px solid icon. Aria label `"Play"` or `"Pause"`. Hover `#2B95FF`. Disabled: `rgba(255,255,255,0.14)`.
  - `"Forward 10 seconds"`: same as back, mirrored.
  - Pressed: `scale(0.92)`. Disabled: opacity 0.32. Hover (only on hover devices): `rgba(255,255,255,0.18)`.
- **Stop** (`.stop-row`, margin-top 18 px): pill 44 px tall, padding `0 20px`, background `rgba(255,69,58,0.14)`, border `rgba(255,69,58,0.36)`, text `#FF6961`, 15 px / 600, 16 px solid square icon, label `"Stop"`. Enabled for any media scene, steerable or not.
- **Foot** (`.foot`, `remote.html:262` and `1254`): divider `1px rgba(255,255,255,0.08)`, padding-top 14 px, 12.5 px, `--text-3`, clock icon 14 px. Shown only while steerable.
  - `"Reported 3s ago"` (seconds, then `m`, `h`, `d`)
  - after 15 s (`STALE_MS`): `"Last report 2m ago. Is the TV on?"` in `--orange`
  - before any report: `"No report from the TV yet"`
- **Enabled states:** play or pause needs a steerable video. Back, forward and the scrubber also need it not to be live; the scrubber also needs a duration. Stop needs a media scene.
- **Actions:** all go to `POST /control {action, seconds?}`. Play or pause and seeks update the UI at once, and the guess holds for 5 s (`PENDING_MS`) or until the TV's report agrees. A seek is clamped to `duration − 0.5`. Dragging the scrubber previews elapsed and remaining; letting go seeks.
- **Keyboard** (`remote.html:1393`, ignored while an input has focus): Space or `k` toggles play; Left or `j` goes back 10 s; Right or `l` goes forward 10 s.
- **Toasts:** a 409 shows the hub's error, else `"Nothing is playing on the TV."`; another failure shows `"The hub answered <status>."`; a network failure shows `"Couldn't reach the hub. Check your connection."`; stop shows `"Stopped. The TV is back to its idle screen."`. The hub's 409 for a scene that is not media reads `"There is no media on the TV to control (it shows the idle screen)."` (`hub/src/screen.ts:936`).

### 7. Now playing: live stream

A report with no `durationSec` and no error counts as live (`remote.html:952`). The timeline gets `data-live`: the range and the remaining time are hidden, the times row becomes 36 px tall, and a red `"LIVE"` badge shows: 22 px tall, padding `0 9px`, radius 6 px, `--red`, white 11 px / 700, `letter-spacing: 0.08em`, with a 6 px white dot before the text (`remote.html:174`). Back and forward are disabled. Note: `"Live stream: seeking is off."`

### 8. Now playing: offline and stale

After two failed polls (`offline()`, `remote.html:950`) the card gets `data-offline`: the main row and the timeline fade to opacity 0.5. The state text becomes `"Last known: <state>"` (for example `"Last known: Playing"`) in orange, or `"Offline"` when there is no state. The position stops advancing. The banner (item 2) shows above.

### 9. Phone lock screen and control centre

`remote.html:1400` to `1469`. This is not a page: it uses the Media Session API, with a looping one-second silent 8 kHz WAV so the phone treats the page as media. It is active while a video is steerable. The first tap anywhere in the page starts the audio, because browsers need a user gesture for that.

- Metadata: title is the Now playing title; artist is the subtitle, or `"On the TV"`; album `"tvdash"`; artwork `/remote/icon-180.png` (180 × 180).
- Playback state `playing` or `paused`; position state when a duration is known.
- Actions: play, pause, seek backward and seek forward (the OS offset, default 10 s), and seek to. All go to `POST /control`.
- When the OS pauses the silent loop, the page restarts it; the TV is what pauses.

### 10. D-pad (Remote panel)

`remote.html:560` to `574`, logic `remote.html:2167` to `2206`; tab `remote`.

- Heading `"Remote"`.
- Pad (`.pad`): a circle `min(280px, 78vw)` square, margin `14px auto 0`, background `rgba(255,255,255,0.12)`, hairline border, `touch-action: none`.
- Four arrow keys, each 33% of the pad and round, placed at top, bottom, left and right (offset 33.5%). Each has a 30 px chevron rotated to face its direction. Aria labels `"Up"`, `"Down"`, `"Left"`, `"Right"`.
- Centre `"OK"`: 33% circle, `--blue`, white 17 px / 600 text, shadow `0 10px 30px rgba(10,132,255,0.4)`. Pressed `#2B95FF`.
- Pressed keys (`:active` or `data-pressed` for 150 ms): background `rgba(255,255,255,0.16)`, `scale(0.94)`.
- Row below (`.pad-row`, three equal columns, gap 10 px, margin-top 16 px), each a `.secondary` button: `"Back"`, `"Menu"`, and a solid play icon labelled `"Play or pause"` (20 px icon).
- `.secondary` (`remote.html:393`): min-height 44 px, padding `0 16px`, radius 14 px, border `1px rgba(255,255,255,0.14)`, background `rgba(255,255,255,0.12)`, `--text`, weight 600.
- Every tap sends `POST /key {key}` with key `up`, `down`, `left`, `right`, `ok`, `back`, `menu` or `playpause`, and vibrates 8 ms where supported.
- A swipe of at least 40 px across the pad presses the arrow in that direction, and the click that follows is swallowed (`remote.html:2185`).
- Errors (toast): the hub's error (a 409 reads `"There is no TV connected to the hub."`, `hub/src/http.ts:210`), else `"The hub answered <status>."`, or `"Couldn't reach the hub. Check your connection."`

### 11. Volume row

`remote.html:576` to `581`, CSS `remote.html:220`, logic `remote.html:2098` to `2165`; inside the Remote panel.

- Grid `48px 48px minmax(0,1fr) 48px`, gap 10 px, margin-top 14 px.
- Mute (`.secondary`, 20 px speaker icon): aria `"Mute"` or `"Unmute"`, `aria-pressed`. When muted the icon is speaker-off and the button turns orange (`--orange`, border `rgba(255,159,10,0.5)`).
- `"−"` and `"+"` (22 px glyphs), aria `"Volume down"` and `"Volume up"`. Each press sends one step; holding the button sends one step, then after 400 ms another every 120 ms until released. Vibrates 6 ms.
- Slider 0 to 100, aria `"Volume"`, `aria-valuetext` `"19"` or `"19, muted"`. Dragging sends `set` at most every 150 ms, and once more on release; the dragged value holds 2.5 s until the TV's report catches up.
- Unknown state: before the TV has reported a volume (`GET /status` `volume` is null), the row has `data-unknown` and the slider is at opacity 0.4.
- Actions: `POST /volume {action: "up" | "down" | "mute" | "set", level?}`. Errors go to a toast, same strings as item 10.

### 12. TV browser panel

`remote.html:586` to `618`, logic `remote.html:1630` to `1905`; tab `browse`.

- Heading `"TV browser"`.
- **Open page row** (shown only when `GET /browsing` has a `page`): a 32 px globe tile (radius 10 px, glass) with the page title (or host) and the host below (12.5 px, `--text-3`).
- **Page actions** (same condition): grid of three equal columns, gap 8 px, each a `.secondary` with min-height 40 px, 13.5 px, 14 px icons:
  - `"Bookmark"` (star). The star fills `#64B5FF` when the page is already bookmarked. Toggles `POST /browse {bookmark: {url, title}}` or `{unbookmark: url}`, and updates the list locally before the TV's copy comes back.
  - `"Open here"` (link icon): a plain link to the page URL, opened in a new tab on the phone.
  - `"Play video"` (solid play): `POST /browse {action: "play-video"}`, which plays the page's video in the TV's player.
- **Address form**: a `.field` with a globe icon, placeholder `"Search or address"`, `inputmode="url"`, `enterkeyhint="go"`, then a primary `"Go"` with an arrow. Submit sends `POST /browse {input}`. An address opens; other words are searched for, by the TV's address-bar rules. Success toast: `"Opening <text> on the TV."`
- **Back, Forward, Reload** (three equal `.secondary` buttons, chevrons rotated left and right, a reload icon): `POST /browse {action: "back" | "forward" | "reload"}`, with an 8 ms vibration.
- **Mouse mode switch** (shown only while a page is open): a full-width row with a divider above (`1px rgba(255,255,255,0.07)`, margin-top 14 px). Text `"Mouse mode"` (600) and `"The arrows move a pointer instead of jumping between links"` (12.5 px, `--text-3`). The knob is 51 × 31 px, off `rgba(255,255,255,0.16)`, on `--green`, with a 27 px white thumb that slides 20 px. `role="switch"`. A tap sends `{action: "pointer-on"}` or `{action: "pointer-off"}`; the new state shows at once and holds up to 8 s until the TV reports it.
- Errors: toasts as in item 10 (409 `"There is no TV connected to the hub."`).

### 13. Address suggestions

`remote.html:608`, `1838` to `1875`. A list under the address field. Focusing the field refreshes `GET /browsing` (if older than 5 s). Typing shows up to 5 matches, bookmarks first and then history, matching the URL or title, each page once. Each row is a full-width button, min-height 52 px: a star or clock tile, the title, and the URL without scheme or `www.` (12.5 px, `--text-3`). A tap opens it on the TV (`POST /browse {input: url}`). The list is hidden when empty.

### 14. Touchpad panel

`remote.html:620` to `648`, CSS `remote.html:357` to `382`, logic `remote.html:1933` to `2038`; tab `touch`. Hidden on devices with a fine pointer and hover.

- Header row: `"Touchpad"` heading and, at the right, the socket state (12.5 px): `"Connecting"` (`--text-3`) or `"Ready"` (`--green`).
- Surface (`.touchpad`): `height: min(52vh, 340px)`. On a phone it is `max(260px, calc(100dvh - 350px - safe areas))`, so it fills the screen between header and tab bar. Radius 22 px, background `rgba(0,0,0,0.28)`, hairline border, hint text at the bottom centre (12.5 px, `--text-3`).

| State | Look | Hint |
|---|---|---|
| no page open on the TV | opacity 0.55 | `"Open a page in the TV browser to use the touchpad"` |
| ready (a page is open) | full opacity | `"Drag to move · tap to click · two fingers to scroll"` |
| finger down | border `rgba(10,132,255,0.7)`, background `rgba(10,132,255,0.06)` | same |

- Gestures, sent on the `/touch` socket (protocol 1.12): one-finger drag sends `{kind: "move", dx, dy}`; two or more fingers send `{kind: "scroll", dx, dy}`; a one-finger touch that moves under 10 px and lasts under 300 ms sends `{kind: "click"}` and vibrates 8 ms. Moves are summed and sent every 30 ms. The socket retries 2 s after it closes.
- Row below (`.touch-row`, grid `minmax(0,1fr) minmax(0,1.25fr) 52px 52px`, gap 8 px, margin-top 12 px, buttons min-height 48 px, 20 px icons): `"Back"`, `"Forward"`, a reload icon (aria `"Reload"`), and a keyboard icon (aria `"Keyboard"`, `aria-expanded`; open state has a blue border `rgba(10,132,255,0.8)` and text `#64B5FF`). The first three send `POST /browse` as in item 12.

### 15. Touchpad keyboard form

`remote.html:638` to `647`, logic `remote.html:1560` to `1574`. The keyboard button toggles it, focuses the input and scrolls it into view.

- Field placeholder `"Type into the TV"`, `enterkeyhint="go"`.
- Two equal buttons (`.pad-row.two`): `"Type"` (secondary) and `"Enter"` (primary with an arrow).
- `"Type"` sends `POST /type {text, enter: false}`; Enter or the submit sends `{text, enter: true}`. The box clears on success.
- Toasts: `"Typed \"<text>\"."`, `"Typed \"<text>\" and pressed Enter."`, `"Pressed Enter on the TV."` (empty text with Enter). Errors as in item 10.

### 16. "Bookmark what's on the TV"

`remote.html:636`, logic `remote.html:1754` to `1773`. A full-width `.secondary` under the touch row, min-height 48 px, margin-top 8 px, a star icon and a one-line label. The target is the TV browser's page, or the URL of the media scene on screen (http or https only).

| State | Label | Look |
|---|---|---|
| nothing to bookmark | `"Nothing to bookmark on the TV"` | disabled |
| not bookmarked | `"Bookmark <title>"` | normal |
| bookmarked | `"Bookmarked, tap to remove"` | text and border blue `#64B5FF` / `rgba(10,132,255,0.8)`, star filled |

A tap toggles it (`POST /browse {bookmark}` or `{unbookmark}`); toast `"Bookmarked"` or `"Bookmark removed"`.

### 17. History and bookmarks panel

`remote.html:650` to `663`, logic `remote.html:1697` to `1830`; tab `browse`.

- Heading `"History & bookmarks"`.
- Segmented tabs (`.tabs`): two equal halves, padding 3 px, gap 3 px, radius 14 px, background `rgba(0,0,0,0.28)`, hairline border. Each tab is min-height 38 px, radius 11 px, weight 600. Selected: background `rgba(255,255,255,0.12)`, `--text`; unselected `--text-2`. Labels `"Bookmarks"` (default) and `"History"`.
- Filter field: globe icon, `type="search"`, placeholder `"Find a page"`. It filters on URL or title as you type.
- **Bookmarks tab:** the TV's own bookmarks, newest first, then the laptop's "TV" folder (from `GET /status` `bookmarks`), leaving out any URL the TV already has. Laptop rows show a `"Laptop "` tag (11 px / 700, uppercase, `letter-spacing: 0.04em`, `#64B5FF`) before the URL, and have no actions button.
- **History tab:** at most 60 visits, under day headings (13 px / 600, `--text-2`): `"Today"`, `"Yesterday"`, or a long local date (weekday, day, month).
- Each row: a button with a 32 px tile (star for bookmarks, clock for history), the title, and the URL without scheme (12.5 px, `--text-3`). A tap opens it on the TV (`POST /browse {input: url}`), toast `"Opening <title> on the TV."`. On the right, a `"⋯"` button (44 × 44 px, radius 12 px, 20 px, `--text-3`; aria `"More for <title>"`) opens an actions row indented 44 px (`.item-actions`, wrap, gap 8 px, buttons min-height 40 px, 14 px): `"Bookmark"` or `"Remove bookmark"`, and in History also `"Forget"` (`POST /browse {forget: url}`).
- Rows are separated by `1px rgba(255,255,255,0.07)`, padding 10 px 0 (`.feed li`).
- Empty states (14 px, `--text-3`): `"No page matches"` (with a filter), `"No bookmarks on the TV yet"`, `"Nothing visited on the TV yet"`.

### 18. Library panel

`remote.html:554` to `558`, logic `remote.html:1024` to `1122`; tab `library`. Hidden while every row is empty.

- Heading `"Library"`. Rows from `GET /status` `library`, in order: `"Continue watching"`, `"Sent to the TV"`, `"From Claude"` (titles come from the hub, `PROTOCOL.md` Library). Empty rows are left out. Each row shows at most 10 items, under an `h3` (13 px / 600, `--text-2`); rows are 16 px apart.
- Item: a button (min-height 48 px) with a 32 px tile (a solid play icon for media, a link icon for links), the title (or host), and a subtitle (12.5 px, `--text-3`):
  - more than 10 s left: `"<M:SS> left · <age> ago"`
  - else: `"From <sender> · <age> ago"`, where the sender is `Claude`, `your laptop`, `the command line`, `a phone` or `the TV`
  - when both position and duration are known, a 3 px progress bar (`rgba(255,255,255,0.12)`, filled `--blue`, radius 2 px).
- A tap sends `POST /send {url, title, from: "phone", startAt?}`, resuming where the player stopped unless that was within 10 s of the end. The result is a toast with the hub's message, for example `"Playing \"<label>\" in the TV's player from 1:30."` (`hub/src/media.ts:109`).
- `"⋯"` opens the actions row: `"From the start"` (media with a resume point), `"Up next"` (media: `POST /queue`), `"Remove"` (`POST /library/remove {id}`).

### 19. Send to TV form and result

`remote.html:665` to `697`, logic `remote.html:1471` to `1592`; tab `library`.

- Heading `"Send to TV"`.
- Link field: link icon, `type="url"`, placeholder `"Paste a link to play"`, `enterkeyhint="send"`. Inside it at the right a `"Paste"` chip (38 px tall, radius 11 px, glass, 13.5 px / 600, clipboard icon), shown only where `navigator.clipboard.readText` exists. It pastes the first http(s) URL in the clipboard text. If it is blocked: `"Clipboard access was blocked. Long-press the field to paste."`
- Row: a start field (stopwatch icon, placeholder `"Start at 1:30"`), a `.secondary` `"Up next"`, and a primary `"Send"` with an arrow. On a phone the field takes its own line.
- Field style (`.field`, `remote.html:272`): 52 px tall, padding `0 6px 0 16px`, radius 16 px, background `rgba(0,0,0,0.28)`, hairline border; focus border `rgba(10,132,255,0.8)` with ring `0 0 0 3px rgba(10,132,255,0.22)`; input 16 px; 18 px icon in `--text-3`.
- Primary (`.primary`, `remote.html:288`): 52 px tall, padding `0 22px`, radius 16 px, `--blue`, white 16 px / 600, shadow `0 10px 28px rgba(10,132,255,0.35)`. Pressed `scale(0.97)`. Busy (`aria-busy`): opacity 0.6.
- Start times accepted: `90`, `1m30s`, `1:30`, `1:02:03` (`remote.html:832`).
- Action: `POST /send` (or `POST /queue` for Up next) `{url, from: "phone", startAt?}`.
- Result box (`.result`, `remote.html:296`), margin-top 14 px, padding 14 px, radius 18 px, 14 px: a 36 px badge (radius 11 px), a bold heading and a `--text-2` detail. Success is green (`rgba(48,209,88,0.1)`, border `0.32`, badge `0.2` with `--green` icon). Error is red (`rgba(255,69,58,0.1)`, border `0.38`, badge `--red`).

| Result | Badge icon | Heading | Detail |
|---|---|---|---|
| not an http(s) URL | alert | `"That is not a link"` | `"Paste a full http(s) address, like the one in your browser’s address bar."` |
| bad start time | alert | `"Start time not understood"` | `"\"<text>\" is not a time. Use 1:30, 90 or 1m30s."` |
| hub refused | alert | `"The hub said no"` | the hub's error, or `"It answered <status>."` |
| network | alert | `"Couldn't reach the hub"` | `"Nothing was sent. Check your connection and try again."` |
| queued, not playing | check | `"Added to Up next"` | hub message, or `"Queued."` |
| opened in the player | tv | `"Opens in the TV's player"` | hub message |
| opened in an app | apps | `"Opens in the YouTube app"` (Twitch, Netflix, or `"streaming"`) | hub message |
| opened in the browser | globe | `"Opens in the TV's browser"` | hub message |

### 20. Share-sheet setup (iPhone and iPad)

`remote.html:688` to `696`, logic `remote.html:1594` to `1617`. Shown only on iPhone, iPad or iPod (an iPad that reports as `MacIntel` with touch counts too), inside the Send to TV panel under a divider (`1px rgba(255,255,255,0.08)`, padding-top 14 px, 13.5 px, `--text-2`).

- `"Play on TV from the share sheet."` (bold, `--text`) `" Share a link from YouTube or Safari straight to the TV."`
- Numbered list (gap 4 px): `"Tap the button: it copies a key and downloads the Shortcut."`, `"Open the download, tap Add Shortcut and paste the key."`, `"In YouTube or Safari, tap Share, then Play on TV."`
- Full-width `.secondary` button `"Add Play on TV"` with an arrow.
- Action: `POST /devices/shortcut` (phone devices only) makes a new device token; it goes to the clipboard while the tap still counts as a gesture. Then the toast `"Key copied. Paste it when the Shortcut asks."` and, 600 ms later, navigation to `/remote/play-on-tv.shortcut` (a download named `Play on TV.shortcut`, `hub/src/remote.ts:49`).
- Errors: the hub's error (a non-phone device gets `"Open the phone remote to add the Shortcut."`, `hub/src/pair.ts:50`), `"The hub did not make a key."`, or `"Could not copy the key."`

### 21. Arrival from the Android share sheet

`remote.html:2244` to `2260`. The manifest makes the installed app a Web Share Target (`GET /remote?url=&text=&title=`, `hub/src/remote.ts:27`). On arrival the page switches to the Library tab, takes the first http(s) URL from `url`, then `text`, then `title`, fills the form (and the start time from `t` or `start`), clears the query, and sends at once, with the shared title unless it is just the link again. The result shows in the Send result box (item 19). With no link: heading `"No link in what was shared"`, detail `"Share a page or video link to send it to the TV."`

### 22. Type on the TV panel

`remote.html:699` to `712`, logic `remote.html:1540` to `1558`; tab `browse`.

- Heading `"Type on the TV"`. A field (globe icon, placeholder `"A search, an address, a field's text"`, `enterkeyhint="go"`), a `.secondary` `"Type"` and a primary `"Enter"` with an arrow.
- `POST /type {text, enter}`: into the field focused in the TV browser, else into its address bar. Toasts as in item 15.

### 23. Up next panel

`remote.html:714` to `720`, logic `remote.html:996` to `1022`; tab `library`. Hidden while the queue is empty, so there is no empty state.

- Header row: `"Up next"` and a `.secondary` `"Play now"` (`POST /queue/next`; a 409 toasts `"Up next is empty"`).
- Each item: a 32 px tile with its position number (`1`, `2`, ...), the title or URL (14 px, one line), and a `"×"` button (44 × 44 px, aria `"Remove <title> from Up next"`), which sends `POST /queue/remove {id}`.
- There is no reordering in the UI, although the hub has `POST /queue/move`.

### 24. Recent activity panel

`remote.html:722` to `725`, logic `remote.html:1272` to `1305`; tab `activity`.

- Heading `"Recent activity"`. The last 8 items of `GET /status` `activity`.
- Each row: a 32 px tile (radius 10 px, glass) with a 16 px icon by tool (`play_media` play, `show_card` card, `open_link` link, `control_playback` stop, `clear_screen` moon, anything else info), the one-line summary (14 px, ellipsis; tooltip `"<summary> (<tool>)"`), and the age at the right (`"3s"`, `"2m"`, `"1h"`, `"4d"`; 12.5 px, `--text-3`, tabular; tooltip with the full local time).
- Empty: `"Nothing yet"` (14 px, `--text-3`).

### 25. Bottom tab bar (phone width)

`remote.html:729` to `735`, CSS `remote.html:429` to `437`, logic `remote.html:1913` to `1931`.

- Fixed to the bottom, five equal columns, padding `4px` plus safe areas, background `rgba(16,16,20,0.84)`, a top hairline, `backdrop-filter: blur(24px) saturate(150%)`, z-index 9. Hidden at 880 px and wider.
- Each button: min-height 56 px, a 24 px icon over an 11 px / 600 label, `--text-3`; the current tab is `#64B5FF` (`aria-current="page"`).
- Tabs and what they show:

| Tab | Icon | Sections |
|---|---|---|
| `"Remote"` (default) | remote | Now playing, Remote (D-pad and volume) |
| `"Touchpad"` | touch | Touchpad |
| `"Browse"` | globe | TV browser, History and bookmarks, Type on the TV |
| `"Library"` | apps grid | Library, Send to TV, Up next |
| `"Activity"` | clock | Recent activity |

- The chosen tab is remembered in `localStorage` (`tvdash-remote-tab`), and a tap scrolls to the top. On a phone the toast sits 84 px above the bottom and the keyboard bar 76 px, to clear the bar.

### 26. Keyboard bar (a field is focused on the TV)

`remote.html:739` to `752`, CSS `remote.html:408` to `423`, logic `remote.html:2040` to `2096`. It appears by itself when the TV reports a focused text field on the `/touch` socket (protocol 1.14).

- Fixed, left and right 12 px, bottom 16 px plus safe area (76 px on a phone), `max-width: 560px` centred, padding `10px 12px 12px`, radius 20 px, background `rgba(28,28,32,0.96)`, border `1px rgba(10,132,255,0.45)`, `backdrop-filter: blur(24px)`, shadow `0 16px 40px rgba(0,0,0,0.55)`, z-index 11. While it shows, the page gets 220 px of extra bottom padding.
- Head row (13 px): `"Typing on the TV"` (600, `#64B5FF`), the field's placeholder as a hint (`--text-3`, ellipsis), and a `"×"` close button (36 × 36 px, aria `"Hide the keyboard"`).
- Row: a field (placeholder is the TV field's placeholder, else `"Type here"`) and a primary `"Enter"`.
- The input type and keyboard follow the TV field's kind: password masked, and `email`, `url`, `tel`, `decimal` (for number) or `search` input modes. It is pre-filled with the field's value (passwords are never sent).
- Behaviour: it focuses at once (on iPhone the user taps once), vibrates 10 ms, and mirrors the whole text to the TV 150 ms after the last keystroke (`POST /type {text, enter: false, replace: true}`, sent in order). Enter sends `enter: true` and blurs. Closing hides it for that field until a different field gets focus.

### 27. Toast

`remote.html:753`, CSS `remote.html:395` to `406`, logic `remote.html:1315`.

- Fixed, centred, bottom 18 px plus safe area (84 px on a phone), z-index 10, `max-width: min(440px, 100vw - 32px)`, padding `12px 16px`, radius 16 px, 14 px / 500, background `rgba(28,28,32,0.86)`, hairline border, `backdrop-filter: blur(24px)`, shadow `0 16px 40px rgba(0,0,0,0.5)`.
- An 18 px icon: a green check for success, a red alert for errors.
- Slides up from `translateY(140%)` with opacity over 0.3 s (`cubic-bezier(.2,.8,.2,1)`). It stays 2.2 s (success) or 4.5 s (error).
- Generic hub errors: the hub's `error`, `"The hub answered <status>."`, `"Couldn't reach the hub."` (library actions) or `"Couldn't reach the hub. Check your connection."`

### 28. Installed web app (manifest and icon)

`hub/src/remote.ts:10` to `28`, `hub/src/icon.ts:10` to `21`.

- Manifest: name `"tvdash remote"`, short name `"tvdash"`, description `"Control what plays on the TV."`, start URL and scope `/remote`, `display: "standalone"`, `orientation: "portrait"`, background and theme `#05060A`. Icons: SVG (any), PNG 192 and 512, and 512 maskable. Share target `GET /remote` with `url`, `text`, `title`.
- Icon (512 grid): background `#05060A`; a blue radial glow `#0A84FF` at 55% opacity from (0.2, 0.1) and an indigo glow `#5E5CE6` at 50% from (0.95, 0.95); a 280 × 200 rounded screen (radius 36, white at 8% fill, white 18% 6 px stroke); a stand line (white 35%, 12 px, round); a blue `#0A84FF` play triangle. PNGs are drawn in code at 180, 192 and 512 px.
- README (`README.md:97`) tells people to add it to the home screen. Installed on Android, it also appears in the share sheet.

### 29. iPhone "Play on TV" Shortcut

`hub/scripts/shortcut.mjs:43` to `83`; the signed file is embedded in `hub/src/shortcut-file.ts` and served at `/remote/play-on-tv.shortcut`. iOS draws all of this UI; tvdash only supplies the strings.

- Import question: `"Paste the key the tvdash remote copied for you"`.
- Accepts URLs, Safari pages and text from the share sheet (`ActionExtension`). It takes the first link and sends `POST /send {url, from: "phone"}` with `Authorization: Bearer <key>`.
- Result: an iOS notification titled `"tvdash"` whose body is the hub's `message` or `error`, with no sound.

---

## Claude sign-in page (`/authorize`)

`hub/src/oauth.ts:57` to `128`. The OAuth consent page for claude.ai, Claude Desktop and the Claude phone apps, which add the hub as a custom connector. The hub always serves it (`hub/src/auth.ts:60`).

### 30. Default

- Viewport: `width=device-width, initial-scale=1`. The body is a full-height grid that centres `main`, `width: min(420px, calc(100vw - 32px))`.
- Tokens (inline): `--ink #05060a` (background), `--text #f5f5f7`, `--dim #a1a1aa`, `--blue #0a84ff`, `--red #ff453a`; `color-scheme: dark`. Font `16px/1.5 Inter, system-ui, sans-serif` (Inter is not loaded here, so the system font is used unless Inter is installed).
- Title and `h1` (26 px, line-height 1.2, margin-bottom 8 px): `"Connect <app> to your TV"`. `<app>` is the OAuth client's name, else `"An app"`.
- Paragraph (`--dim`, margin-bottom 20 px): `"On the TV, open Pair a device on the toolbar and type the six digits it shows."` (**Pair a device** in bold).
- Code input: full width, `600 32px/1 ui-monospace, monospace`, `letter-spacing: 0.3em`, centred, padding 14 px, radius 14 px, border `1px #ffffff2e`, background `#ffffff14`; `inputmode="numeric"`, `autocomplete="one-time-code"`, `maxlength="7"`, placeholder `"123 456"`, autofocus, required.
- Button row (flex, gap 10 px, margin-top 16 px), two equal buttons, min-height 48 px, radius 12 px, `600 15px`: `"Cancel"` (background `#ffffff14`) and `"Connect"` (`--blue`, white).
- Cancel posts `action=deny` and redirects back to the client with a denial. Connect posts `action=approve`; a right code records a `claude` device and redirects to Claude.
- No JavaScript.

### 31. Error

Same page with status 403 and a red paragraph (`role="alert"`, `--red`, margin-top 12 px) under the input:

- `"Type the six digits the TV shows."` (not six digits)
- `"The TV is not showing a pairing code. Open Pair a device on the TV."`
- `"That is not the code on the TV."`
- `"Too many wrong codes. Open Pair a device on the TV again for a new one."`

A wrong code leaves the consent handle unused, so the user can try again on the same page (`oauth.ts:112`).

---

## Browser extension (`extension/`, Manifest V3, Chrome and Brave)

Name `"tvdash"`, version `0.3.0`, action title `"tvdash remote"` (`extension/manifest.json`). The manifest declares no icons, so Chrome shows its default letter icon. The token is kept in `chrome.storage.local` (`paired: {hub, token, id}`), and the hub URL in `chrome.storage.sync` (default `https://tvdash-hub.tvdash-hub.workers.dev`, `extension/payload.js:4`).

**Popup viewport:** `body { width: 380px }` (`extension/popup.css:15`). Its height follows the content. Chrome caps popups at about 800 × 600 px and scrolls the rest (a browser limit, not set in the code). Font `13px/1.4 Inter, system-ui, sans-serif`; Inter is not bundled. Sections are padded `12px 16px`. Section headings (`.eyebrow`, `popup.css:28`) are 11 px / 600, uppercase, `letter-spacing: 0.08em`, `--text-3`, with an optional lower-case hint (weight 400, margin-left 6 px).

**Popup data flow:** `GET /status` every 1000 ms while open, re-render every 250 ms (`extension/popup.js:250`). Sending, pins, present and couch mode go through the background service worker.

### 32. Popup: header and connection

`extension/popup.html:9` to `18`, CSS `popup.css:16` to `26`, logic `popup.js:60`.

- Flex row, gap 10 px, padding `12px 16px`, bottom border `1px rgba(255,255,255,0.08)`.
- Mark: a 20 × 20 px square, radius 6 px, `--blue #0a84ff`, with nothing inside. Then `"tvdash"` (strong, 15 px).
- Connection pill (pushed right): padding `4px 10px`, radius 999 px, `--raised #1c1c24`, 12 px, `--text-2 #c7c7cc`, a 7 px dot.
  - start: `"Connecting"`, dot `--text-3 #8e8e96`
  - `GET /status` succeeded: `"Living room TV"` (a fixed string), dot `--green #30d158`
  - failed: `"Hub unreachable"`, dot `--red #ff6961`
- `"Pair with the TV"` link (opens Options). It is `hidden` in the markup and no code ever shows it (`popup.html:13`, `popup.js:27`).
- `"Home"` link: opens `home.html` in a new tab. 12 px, `--text-2`, padding `6px 8px`, radius 8 px; hover `--text` on `--raised`.
- Options: a 32 × 32 px icon button (radius 8 px, `--text-3`, an 18 px sun-like gear outline), aria `"Options"`, opens the options page.

### 33. Popup: pair section

`popup.html:20` to `27`, logic `popup.js:32` to `43`. Shown when this browser has no token for the configured hub, or when any call answers 401 (`popup.js:22`).

- Background `rgba(10,132,255,0.08)`. Heading `"Pair with the TV"`. Note (12 px, `--text-2`): `"On the TV, open Pair a device on the toolbar, then type its six digits."`
- One input (min-height 40 px, radius 10 px, border `1px rgba(255,255,255,0.12)`, `--raised`), placeholder `"123 456"`, numeric, one-time-code, maxlength 7. No button: Enter submits.
- Action: `POST /pair/claim {code, name, kind: "extension"}`. The name is `"<Browser> on <OS>"`, for example `"Brave on macOS"` (`extension/auth.js:12`).
- Messages in the result line (item 36): `"Pairing…"`, `"Paired with the TV."`, `"Type the six digits the TV shows."`, `"Can't reach the hub: <message>"`, or the hub's error (item 3).

### 34. Popup: "Video found on this page"

`popup.html:29` to `35`, CSS `popup.css:54` to `59`, logic `popup.js:162` to `173`. Shown when the background found a video stream in this tab's network responses: an HLS or DASH manifest, or a video file.

- Box: margin `12px 16px 0`, padding `12px 14px`, radius 12 px, background `#0f2a4d`, border `1px #1f5fae`.
- `"Video found on this page"` (13 px, strong) and a detail (11 px, `--text-2`, ellipsis, URL as tooltip): `"HLS stream"`, `"DASH stream"`, `"Video file, <N> MB"` or `"Video file"` (`extension/streams.js:77`).
- Button `"Play it on the TV"` (`.primary-small`: min-height 40 px, padding `0 12px`, radius 10 px, `--blue-fill #0062cc`, white 13 px / 600). It sends the stream (not the page) through `POST /send` with format and referer. The result goes to the result line. With no stream: `"No video found on this page yet. Start it playing, then try again."`

### 35. Popup: On the TV now

`popup.html:37` to `56`, model `extension/popup-model.js:28`, render `popup.js:72` to `90`.

- Heading `"On the TV now"`. Title (15 px / 600, one line, ellipsis; `"…"` before the first answer) and subtitle (12 px, `--text-2`).

| Scene | Title | Subtitle | Controls |
|---|---|---|---|
| media, player | title or address | `"The TV's player"` | all enabled |
| media, app | title or address | `"The YouTube app"` (or Twitch, Netflix, `"streaming"`) | Stop only |
| media, browser | title or address | `"The TV's browser"` | Stop only |
| card | card title | `"A card"` | none |
| link | title or address | `"A link"` | none |
| idle and anything else (`steps` too) | `"Nothing on the TV"` | `"The home screen"` | none |

- The address is the URL without scheme, `www.` or a trailing slash.
- Timeline (only for the player with a duration): a native range with `accent-color: #0a84ff`, then elapsed and total (`11px ui-monospace`, `--text-2`). Dragging previews the elapsed time; letting go sends `POST /control {action: "seek"}`.
- Controls (centred, gap 14 px, margin-top 10 px): `"−10"` and `"+10"` as text in 44 px circles (`--raised`, `600 11px`), play or pause as a 56 px circle (background `--text #f5f5f7`, icon `--ink #0b0b0f`; aria `"Play"` or `"Pause"`), and a stop circle (44 px, red square icon `--red`, aria `"Stop"`). Disabled at opacity 0.35. Each sends `POST /control`.
- Unlike the phone, the popup does not steer app or browser videos even when the TV reports them, and it has no live badge.

### 36. Popup: Send this tab

`popup.html:58` to `74`, logic `popup.js:133` to `160`, background `background.js:335`, request shapes `extension/payload.js:122`.

- Row (flex, gap 8 px, padding-top 4 px): a primary button (flex 1, min-height 48 px, radius 12 px, `--blue-fill #0062cc`, white, left-aligned, `600 14px`) with `"Send this tab"` and a small line under it (11 px, weight 400, opacity 0.85), then a select (`.secondary`: min-height 48 px, radius 12 px, `--raised`, border `rgba(255,255,255,0.12)`, `600 13px`).

| Select option | Sub-line | Request |
|---|---|---|
| `"Play now"` (default) | `"Plays on the TV"`, or `"Plays on the TV from M:SS"` when the tab's video has started | `POST /send` |
| `"Up next"` | `"After what is playing"` | `POST /queue` |
| `"In the corner"` | `"In a corner, over the home"` | `POST /send {corner: true}` |
| `"QR card"` | `"A card with a QR code"` | `POST /link` |
| `"Later…"` | `"At the time below"` | `POST /schedule {action: "send", at}` |

- The **Later** row appears only for `"Later…"`: `"At"`, a time input (min-height 36 px, radius 8 px), and the hint `"today, or tomorrow once it has passed"` (`--text-3`). With no time: `"Pick a time first."` (error).
- A tab that is not http(s): the button and the select are disabled, and the sub-line reads `"Only http(s) pages can be sent to the TV."` (or `"This tab can't be sent"`).
- **Result line** (`#result`, `popup.css:46`): padding `0 16px`, min-height 18 px, 12 px, `--text-2`; errors `--red`. It holds the hub's message, for example `Opening "YouTube: Big Buck Bunny" in the YouTube app on the TV at 12:34.`, or `"Sent to the TV."`, or `"Could not reach the hub: <message>"`.
- **Undo** (right of the result, `#64b5ff`, `600 12px`, min-height 32 px) appears after Play now, In the corner (it sends stop), Up next (it removes the item) and Later (it cancels the schedule). Clicking it shows `"Undone."`. There is no Undo for a QR card.

### 37. Popup: Pins and Present

`popup.html:76` to `90`, logic `popup.js:175` to `197`, background `background.js:93` to `170`.

- Heading `"Pins"` with the hint `"a live part of this page on the TV"`.
- Row (grid `1fr auto`, gap 8 px): `"Pin part of this page"` and a refresh select (`"every 30 s"`, `"every minute"` (default), `"every 5 min"`, `"every 15 min"`), both min-height 44 px, 12 px. Pin closes the popup and starts the picker in the page (item 44).
- Pin list (from `GET /status` `pins`): rows of min-height 40 px with a top divider, the title (tooltip: the page URL), and a `"×"` (aria `"Unpin <title>"`, `POST /pins/remove`). There is no empty text.
- `"Present this tab on the TV"`: full width, min-height 44 px, 12 px. It sends the page to the TV browser and starts following (item 45). Result: `"Presenting on the TV: scroll and point here, the TV follows. Esc stops."`, or `"Only http(s) pages can be presented."`
- Pin results arrive after the popup has closed, so the popup never shows them. The background strings are `"Pinned \"<title>\" to the TV."`, `"Nothing pinned."` and `"That part of the page isn't on screen; scroll to it and pin again."`.

### 38. Popup: Couch mode

`popup.html:92` to `103`, logic `popup.js:199` to `211`, `extension/couch.js:12`.

- Heading `"Couch mode"`, hint `"Claude makes this page TV-friendly"`.
- Three equal buttons (min-height 44 px, 12 px): `"Cook along"`, `"Summarize"`, `"Find a video"`. Then an input with the placeholder `"Put the ingredients on the TV, doubled"` (Enter asks).
- Running: `"Claude is reading the page… (you can close this)"`. The work runs in the background service worker, which posts the page text to the local helper at `http://127.0.0.1:8790/couch`.
- Results: Claude's last words, or `"Done."`, `"The tvdash helper isn't running. In the project's helper/ folder: npm start"`, `"This page can't be read (a browser page or a PDF viewer)."`, and the helper's errors (item 53). The badge shows `"TV"` or `"ERR"`.

### 39. Popup: Remote and type box

`popup.html:105` to `122`, CSS `popup.css:71` to `75`, logic `popup.js:213` to `248`, key map `popup-model.js:4`.

- Heading `"Remote"`, hint `"arrows · Enter · Esc · Space work too"`.
- Pad: a 3-column grid of 56 px columns, 44 px rows, gap 8 px, centred. Row 1: `"Menu"` (small), `"▲"`, `"Back"` (small). Row 2: `"◀"`, `"OK"` (background `#2c2c36`), `"▶"`. Row 3: empty, `"▼"`, `"⏯"` (small). Buttons: radius 12 px, `--raised`, `600 14px`; small ones 11 px `--text-2`. While pressed (150 ms): background `--text`, text `--ink`.
- Keyboard while the popup is open (not in inputs, not on a focused button for Enter or Space, no modifiers): arrows, Enter (OK), Escape and Backspace (Back), Space (play or pause), `m` (Menu). Each press sends `POST /key`.
- Type box: placeholder `"Type on the TV: Enter sends it and presses Enter"`. It sends `POST /type {text, enter: true}`. Results: `"Typed \"<text>\" on the TV."` or `"Pressed Enter on the TV."`; errors show the hub's message (409 `"There is no TV connected to the hub."`).

### 40. Popup: Up next

`popup.html:124` to `127`, logic `popup.js:92` to `106`. Hidden while the queue is empty. Heading `"Up next"`. Rows of min-height 44 px with dividers: a position number (`11px ui-monospace`, `--text-3`), the title or URL, and a `"×"` (aria `"Remove <title> from Up next"`, `POST /queue/remove`).

### 41. Options page

`extension/options.html`, `extension/options.js`. Opens in Chrome's extension options dialog (`open_in_tab: false`). This page uses the browser's light defaults, not the dark theme: `14px system-ui`, margin 16 px, `min-width: 360px`, muted text `#57606a`, errors `#cf222e`.

- `"tvdash hub URL"` (bold label) and a full-width URL input, placeholder and default `https://tvdash-hub.tvdash-hub.workers.dev`.
- Row: `"Save"`, `"Test connection"`, and a status span.
  - Save: `"Saved."`, or `"The hub URL must start with http:// or https://"` (error).
  - Test (`GET /status`): `"Checking…"`, then `"The hub answers; the TV shows: <scene type>."`, `"Not a tvdash hub (<status>)."` (error) or `"No answer: <message>"` (error). With `AUTH_MODE` on, an unpaired browser gets a 401 here and sees `"Not a tvdash hub (401)."`.
- `"Pair with the TV"` (`h2`, 14 px) and a status paragraph:
  - `"Checking…"` (start)
  - `"Not paired. On the TV, choose Pair a device on the toolbar, then type the code here."`
  - `"Paired with the TV as \"<name>\"."` (from `GET /devices/me`)
  - `"The TV unpaired this browser. Pair it again with a new code."` (error, 401)
  - `"The hub answered <status>."` or `"Paired, but the hub doesn't answer: <message>"` (errors)
  - `"Pairing…"`, then the pair errors from item 33
- Form row: a code input (9em wide, `letter-spacing: 0.2em`, tabular, placeholder `"123 456"`), `"Pair"`, and `"Forget pairing"` (shown when a pairing is stored; it only deletes the local token, the TV still lists the browser).

### 42. Home page (`home.html`)

`extension/home.html`, `extension/home.css`, `extension/home.js`. A page meant to be the browser's home or startup page (`chrome-extension://…/home.html`). It is not a new-tab override (`extension/README.md:38`).

- Viewport `width=device-width, initial-scale=1`; title `"tvdash home"`. `main` is `max-width: 1280px`, padding `40px 24px 56px`; under 600 px wide the padding is `24px 16px 40px` and the clock is 56 px.
- Its palette is green and grey, different from the popup and the phone: `--ink #0d0f0e`, `--card #151917`, `--raised #1f2522`, `--line rgba(255,255,255,0.08)`, `--text #eef2ef`, `--text-2 #b8c0ba`, `--text-3 #8e978f`, `--accent #30d158`, `--red #ff8a80`. Font `15px/1.45 Inter, system-ui`.
- **Header** (flex, wrap, align bottom, gap `24px 32px`, margin-bottom 28 px): a clock (72 px / 700, `letter-spacing: -0.03em`, tabular, `"--:--"` before the first tick) and the long date (`--text-2`). At the right, a search box (`flex: 1 1 360px`, max 620 px, min-height 52 px, radius 14 px, `--card`, border `rgba(255,255,255,0.12)`), placeholder `"Search, or an address. Shift+Enter puts it on the TV"`, focused on load. Enter opens the address or a Brave Search here; Shift+Enter sends it to the TV (`POST /send`).
- **Grid:** `repeat(auto-fit, minmax(300px, 1fr))`, gap 20 px. Cards: `--card`, radius 20 px, padding `22px 24px`; wide cards span all columns. Card headings 12 px / 700, uppercase, `letter-spacing: 0.08em`, `--text-3`.
- **"On the TV"** (wide): title 28 px / 700, subtitle `--text-2` (the same strings as the popup, item 35). A 6 px progress bar (`--accent` fill) and `"M:SS of M:SS"` (13 px, `--text-3`) for the player. Buttons: `"Play"`/`"Pause"` (filled: background `--text`, text `--ink`, min-height 44 px, radius 12 px, `600 14px`), `"Stop"` and `"Bring it here"` (quiet: transparent with a `rgba(255,255,255,0.16)` border). Bring it here is enabled for media and links: `POST /sendback`, after which the extension opens the item in a tab within 30 s (item 48). Result line 13 px, red on error; success shows the hub's message or `"Done."`.
- **"Up next"**: rows (min-height 48 px) with the title, `"from Claude"`, `"from browser"`, `"from phone"`, `"from CLI"` or `"from TV"`, and a quiet `"Remove"`. Empty: `Nothing lined up. Send a tab with "Up next" from the toolbar.`
- **"Scenes"** (`GET /scenes`): the name, `"<N> action(s)"`, and `"Run"` (`POST /scenes/run`). Empty: `"No scenes yet. Save one with POST /scenes (see the README), then run it here, from the CLI, or by asking Claude."` There is no UI to create or edit a scene anywhere.
- **"Scheduled"** (`GET /schedule`): `"Clear the TV"`, `"Queue <title>"` or `"Play <title>"`, a short local time (weekday, hour, minute), and `"Cancel"` (`POST /schedule/cancel`). Empty: `Nothing scheduled. Pick "Later…" when you send a tab.` A scheduled scene shows as `"Play <url>"`, because the row has no case for it (`home.js:85`).
- **"On the TV lately"** (wide): the library rows (`h3` 14 px, `--text-2`), at most 6 items each, with `"M:SS of M:SS"` when there is a position, `"Play on TV"` (`POST /send`, resuming) and a quiet `"Open here"`. Empty: `"Nothing yet. What you send to the TV shows up here."`
- **Offline:** the On the TV title becomes `"The hub is out of reach"` and the subtitle the error message. It refreshes every 3 s while visible and ticks every second.
- Unlike the popup, a 401 here shows no pairing prompt: it is reported as the hub's error text.

### 43. In-page "Play on TV" chip

`extension/content.js`. Injected into every http(s) page in a closed shadow root, fixed at z-index 2147483647.

- It shows when the pointer moves over a video at least 200 × 120 px, 12 px in from the video's top-right corner (at least 8 px from the viewport edge). It hides after 2.5 s without movement, and stays while the pointer is on it.
- Pill: min-height 32 px, padding `6px 12px`, radius 999 px, background `rgba(11,11,15,0.86)`, white `600 12px/1 system-ui`, border `1px rgba(255,255,255,0.28)`; hover and focus `#0062cc`. A 14 px TV outline icon.
- Labels: `"Play on TV"` (not started), `"Play on TV from 3:41"`, then `"Sending…"`, then `"On the TV"` or `"Couldn't send"` (the hub's message is the tooltip).
- Action: plays the stream found behind the page if there is one, else the page, from that video's time.

### 44. In-page element picker

`extension/picker.js:4` to `69`. Injected when you choose Pin.

- An outline box (3 px `#0a84ff` border, fill `rgba(10,132,255,0.12)`, radius 4 px) follows the element under the pointer.
- A label 34 px above it (`#0b0b0f`, white `600 12px system-ui`, padding `6px 10px`, radius 6 px): `"<tag> <W>×<H> · click to pin · ↑ bigger · Esc cancel"`.
- Click or Enter pins it; Up arrow takes the parent element; Esc cancels. The pinned crop is a JPEG up to 1280 px wide, refreshed while its tab is visible.

### 45. Presenting a tab

`extension/background.js:158` to `179`, `extension/picker.js:83` to `119`. No visible UI in the page. The badge shows `"LIVE"`, with the tooltip `"Send to TV\nPresenting this tab on the TV. Esc in the page stops."`. Scroll position and pointer go to `POST /present` at most every 150 ms, with a heartbeat every 5 s. Esc in the page stops it and clears the badge.

### 46. Toolbar badge and tooltip

`extension/background.js:46`, `402` to `407`, `extension/payload.js:53`.

- After a send, the badge shows for 5 s, on green `#1a7f37` (ok) or red `#cf222e` (failure): `"▶"` (player), `"YT"`, `"TW"`, `"NF"`, `"APP"` (apps), `"WEB"` (browser), `"OK"`, `"LIVE"` (presenting), `"TV"` (couch done) or `"ERR"`.
- Tooltip: `"Send to TV\n<the hub's message or error>"`.
- When a tab loads a video stream, the badge shows `"▶"` on `#0062cc` for that tab until the next result clears it.
- Shortcut **Alt+Shift+T** (`manifest.json:44`, `"Play this tab on the TV"`) sends the tab with no popup; the badge is the only feedback.

### 47. Right-click menu

`extension/background.js:227` to `258`. A parent item `"tvdash"` on pages, links, videos, audio, images and selections, with:

- `"Play on TV"` (`POST /send`; for the page itself it reads the video's time, like the popup)
- `"Add to Up next"` (`POST /queue`)
- `"Show as a card with a QR code"` (`POST /link`)
- `"Play the video only (no page)"` (the stream found behind the page)
- `"Open in the TV browser, ad-free"` (`POST /send {openIn: "browser"}`)
- `"Show the selected text on TV"`, only on a selection (`POST /card {title: tab title or "From the browser", body: text, kind: "info"}`)

Feedback is the badge. A target that is not http(s) gives `ERR` and `"The TV can only open http(s) links."`

### 48. Send-back

`extension/background.js:265` to `322`. Every 30 s an alarm calls `POST /sendback/claim`. If the TV handed something back, a new tab opens at the TV's position (YouTube `t=<N>s`, `#t=<N>` for video files). No other UI. The same alarm re-sends the laptop's "TV" bookmarks folder to `POST /bookmarks`.

---

## CLI (`cli/tvdash`)

Node 24, no dependencies. Output is plain lines on stdout and stderr, with no colour. Exit codes: 0 done, 1 the hub refused or is unreachable, 2 bad usage (`cli/tvdash:124`).

### 49. Help and usage errors

- `tvdash help`, `-h` or `--help` prints the usage block (`cli/tvdash:11` to `27`), one line per command: `open`, `queue` (both with `--title`, `--at`, `--when`), `schedule`, `scene` / `scenes`, `next`, `play`, `pause`, `stop`, `seek`, `status [--json]`, `card`, `pair <code> [--name N]`, `pair <code> --claude-code`, `unpair`. It ends with where the hub and the pairing come from.
- Usage errors print `"tvdash: <message>"`, a blank line, then the usage, and exit 2. Messages include `"no command"`, `"unknown command \"<x>\""`, `"unknown option --<x>"`, `"--<x> needs a value"`, `"open takes one URL"`, `"--when takes 20:00 or +10m, not \"<x>\""`, `"--at: \"<x>\" is not a time (use 90, 1m30s or 1:30)"`, `"--kind is info, success or warning"`, `"pair takes the six digits the TV shows: tvdash pair 123456"`.

### 50. Command output

- `open`, `queue`, `next`, `play`, `pause`, `stop`, `seek`, `card`, `scene`: the hub's `message`, for example `Playing "<label>" in the TV's player from 1:30.` or `Stopped "<label>"; the TV shows the idle screen.`
- `--when`: `"Scheduled for <local time> (id <id>)."`
- `scenes`: `"<name> (<N> action(s))"` per line, or `"No scenes yet."`
- `schedule`: `"<local time>  <action>  <title or url>  (<id>)"` per line, or `"Nothing scheduled."`
- `pair`: `"Paired as \"tvdash on <host>\". The token is in <path>."`; with `--claude-code`: `"Paired Claude Code as \"Claude Code on <host>\". Add the TV to Claude Code with:"`, a blank line, then the `claude mcp add --transport http tvdash <hub>/mcp --header "Authorization: Bearer <token>"` line.
- `unpair`: `"Forgot this computer's pairing. To remove it on the TV too, unpair it under Pair a device."`

### 51. `status`

`cli/tvdash:276` to `306`. `--json` prints the raw state. Otherwise:

- `"idle (clock and recent activity)"`
- `"card (<kind>): <title>"`
- `"link: <title or url>"` and the URL indented on the next line
- `"media (<player | browser | youtube app ...>): <title or url>"`, the URL, then `"  <state> <M:SS> / <M:SS>[ (<error>)], reported <N>s ago"` (`" (live)"` instead of a duration), or `"  no report from the TV yet"` (plus `" (only the TV's player reports)"` for apps and the browser)
- any other type, `steps` included: `"<type> (this tvdash does not know that scene)"`
- then, if anything is queued, `"Up next:"` and `"  1. <title> (from <source>)"` lines.

### 52. Errors

Printed as `"tvdash: <message>"`, exit 1:

- `"cannot reach the hub at <hub> (<code>); set TVDASH_HUB to change it"`
- `"this computer is not paired with the TV: on the TV, open Pair a device on the toolbar, then run tvdash pair <code>"` (any 401)
- `"the hub answered <status>: <error>"`
- `"the hub at <hub> did not answer JSON; is TVDASH_HUB a tvdash hub?"`

### 53. Couch-mode helper messages

`helper/server.mjs`, `helper/couch.mjs`. A local server on `127.0.0.1:8790` with no page. Its JSON `text` reaches people only through the popup's result line (item 38). Strings: `"Only the tvdash extension may use this helper."` (403 for any origin that is not `chrome-extension://`), `"The page is too big to send."` (over 2 MB), `"The body must be JSON."`, `"No page to read."`, `"The hub must be an http(s) address."`, `"Nothing to ask."`, `"Claude stopped without an answer."`, `"Claude took too many steps; nothing more was sent."`, `"Claude stopped: <reason>"`, `"Claude Code could not run: <first line>"`, and on success Claude's last words or `"Done."`. Its console prints `"tvdash helper on http://127.0.0.1:8790 (Claude Code: <path or built-in>)"` and one `"couch <action> <url>"` line plus `"  done: ..."` or `"  failed: ..."` per request.

---

## Design tokens, as written

There are three palettes and no shared stylesheet. The phone remote and the sign-in page share the near-black `#05060A` and the Apple-style system colours. The popup uses its own greys, and the home page a green-grey set.

### Phone remote (`hub/src/remote.html:21`)

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#05060A` | body, theme colour, manifest |
| `--glass` | `rgba(255,255,255,0.08)` | panels, pills |
| `--glass-strong` | `rgba(255,255,255,0.12)` | chips, buttons, tiles, D-pad |
| `--hairline` | `rgba(255,255,255,0.18)` | borders |
| `--text` | `#F5F5F7` | text, scrubber fill |
| `--text-2` | `rgba(235,235,245,0.64)` | secondary text |
| `--text-3` | `rgba(235,235,245,0.38)` | headings, hints, ages |
| `--blue` | `#0A84FF` | primary, OK, play, focus ring |
| `--green` | `#30D158` | connected, playing, success, mouse mode on |
| `--orange` | `#FF9F0A` | reconnecting, buffering, stale, muted |
| `--red` | `#FF453A` | errors, LIVE, stop tint |
| `--purple` | `#BF5AF2` | declared; only the background glow uses this hue (as `rgba(191,90,242,0.12)`) |
| `--radius` | `28px` | glass panels |
| `--font` | `"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif` | everything |

Colours used outside the tokens: `#64B5FF` (light blue text: selected tab, blue state, keyboard bar title, bookmarked, laptop tag), `#2B95FF` (blue hover and pressed), `#5E5CE6` (indigo in the mark and the art gradient), `#FF6961` (stop text), `#FFB4AE` and `#FFD3CF` (text on red), the art gradients in item 5, `rgba(0,0,0,0.28)` (inset surfaces: fields, touchpad, tabs), `rgba(28,28,32,0.86)` and `0.96` (toast and keyboard bar), `rgba(16,16,20,0.84)` (tab bar), dividers `rgba(255,255,255,0.07)` and `0.08`.

**Type scale** (Inter, `font-feature-settings: "cv11"`, antialiased):

| Size / weight | Where |
|---|---|
| 21 / 700, `-0.015em` | Now playing title |
| 19 / 700, `-0.01em` | brand |
| 17 / 600 | OK key |
| 20 / 600 | arrow keys |
| 16 / 600 | primary buttons; 16 / 400 for field inputs (it stops iOS zooming in) |
| 15 / 400, line-height 1.4 | body, secondary buttons (600) |
| 14 | subtitles, list items, toasts (500), banner, result |
| 13.5 | notes, paste chip, share setup, page actions |
| 13 / 600, uppercase, `0.06em` | panel headings; 13 also for chips, pills, state, times |
| 12.5 | sub-lines, ages, hints, foot |
| 11 / 600 | tab bar labels; 11 / 700 for LIVE (`0.08em`) and the laptop tag (`0.04em`) |
| 7 / 700 | the "10" inside the seek icons |

**Radii:** 28 (panels), 22 (touchpad), 20 (keyboard bar), 18 (banner, result, art), 16 (fields, primary, toast), 14 (secondary, tabs), 12 (row "⋯" and "×" buttons), 11 (paste, result badge, inner tabs), 10 (list tiles, small close), 9 (brand mark), 6 (LIVE), 3 (scrubber track), 999 or 50% (pills, chips, controls, D-pad, knob).

**Spacing:** wrap padding 14 / 16 / 28 / 16 plus safe areas (28 top on desktop); grid gap 14 (20 on desktop); panel padding 20 (26); heading margin-bottom 14; form gap 10; list rows 10 px vertical padding with 12 px gaps; touch targets are at least 44 px (`.secondary`, "×"), 48 px (list items, touch row) and 52 px (fields, primary, suggestions).

**Shadows:** panels `0 20px 60px rgba(0,0,0,0.35)` with an inset top highlight `0 1px 0 rgba(255,255,255,0.06)`; blue glows `0 12px 36px rgba(10,132,255,0.45)` (play), `0 10px 30px rgba(10,132,255,0.4)` (OK), `0 10px 28px rgba(10,132,255,0.35)` (primary), `0 10px 30px` art glows per kind; floating `0 16px 40px rgba(0,0,0,0.5)` (toast) and `0.55` (keyboard bar); thumb `0 2px 10px rgba(0,0,0,0.45)`; knob `0 2px 6px rgba(0,0,0,0.3)`; connected dot `0 0 10px rgba(48,209,88,0.7)`.

**Blur:** panels `blur(28px) saturate(150%)`; tab bar `blur(24px) saturate(150%)`; toast and keyboard bar `blur(24px)`.

**Motion:** transitions 0.12 to 0.3 s (press scales 0.92 to 0.97, toast slide `cubic-bezier(.2,.8,.2,1)`, knob 0.2 s), all off under reduced motion. Haptics: `navigator.vibrate` 6 to 10 ms on keys, volume, clicks and the keyboard bar.

**Icons** (inline sprite, `remote.html:450` to `479`): 24 px grid, 2 px round strokes, or solid where noted. They are `play`, `pause`, `stop`, `chevron` (2.4 px), `back` and `fwd` (circular arrows), `tv`, `app` (4 squares), `globe`, `card`, `link`, `remote`, `touch`, `keyboard`, `speaker`, `speaker-off`, `star`, `reload`, `moon`, `paste`, `arrow`, `check`, `alert`, `info`, `clock`, `time` (stopwatch). The brand mark uses the gradient `#g-mark` (`#0A84FF` to `#5E5CE6`).

### Claude sign-in page (`hub/src/oauth.ts:62`)

`--ink #05060a`, `--text #f5f5f7`, `--dim #a1a1aa`, `--blue #0a84ff`, `--red #ff453a`; input `#ffffff14` with `#ffffff2e` border; Cancel `#ffffff14`. Inter or system-ui at 16 / 1.5; `h1` 26; code `600 32px ui-monospace` at `0.3em`; buttons `600 15px`. Radii 14 (input) and 12 (buttons).

### Extension popup (`extension/popup.css:1`)

`--ink #0b0b0f`, `--raised #1c1c24`, `--line rgba(255,255,255,0.08)`, `--text #f5f5f7`, `--text-2 #c7c7cc`, `--text-3 #8e8e96`, `--blue #0a84ff`, `--blue-fill #0062cc`, `--green #30d158`, `--red #ff6961`. Also `#64b5ff` (Undo), `#2c2c36` (OK key), `#0f2a4d` and `#1f5fae` (video found), and the pair tint `rgba(10,132,255,0.08)`. Type: Inter or system-ui, body 13 / 1.4, header name 15, titles 15 / 600, buttons 14 / 600 (primary), 13 / 600 (secondary), 12 (small), headings 11 / 600 uppercase `0.08em`, times `11px ui-monospace`. Radii 12 (buttons, select, pad keys, found box), 10 (inputs, small buttons), 8 (icon button, links, time input), 6 (mark), 999 (pill), 50% (round controls). No shadows, no blur.

### Extension home page (`extension/home.css:1`)

`--ink #0d0f0e`, `--card #151917`, `--raised #1f2522` (declared, not used), `--line rgba(255,255,255,0.08)`, `--text #eef2ef`, `--text-2 #b8c0ba`, `--text-3 #8e978f`, `--accent #30d158`, `--red #ff8a80`. Type: 15 / 1.45, clock 72 / 700 (56 under 600 px), title 28 / 700, buttons 14 / 600, headings 12 / 700 uppercase `0.08em`. Radii 20 (cards), 14 (search), 12 (buttons), 3 (bar).

### Extension in-page UI

Chip: `rgba(11,11,15,0.86)`, white, border `rgba(255,255,255,0.28)`, hover `#0062cc`, `600 12px system-ui`. Picker: `#0a84ff` outline, `rgba(10,132,255,0.12)` fill, label `#0b0b0f`. Badge: `#1a7f37` ok, `#cf222e` error, `#0062cc` stream found. Options page: system light theme, `#57606a` muted, `#cf222e` error.

---

## Unclear or not found

- **Scenes and schedule on the phone:** not found. The phone remote has no Scenes or Schedule section. Scenes can be listed and run, and scheduled items listed and cancelled, only from the extension's home page (item 42) and the CLI. Nothing creates or edits a scene except `POST /scenes`. The popup's "Later…" and the CLI's `--when` are the only ways to schedule.
- **Pins and present mode on the phone:** not found. Pins are made and removed only in the extension popup; presenting starts only from the popup. The phone has no view of pins.
- **Steps scene on the phone, popup and CLI:** none of them knows the `steps` scene. The phone shows a moon chip labelled `"steps"` and the title `"Something new on screen"`; the popup and home page show `"Nothing on the TV"` / `"The home screen"`; the CLI prints `"steps (this tvdash does not know that scene)"`. There is no step navigation from the phone except the D-pad.
- **Devices list and unpairing from the phone:** not found. Only the TV lists and removes devices (`GET /devices`, `POST /devices/remove`, TV only). The extension's "Forget pairing" and `tvdash unpair` only delete the local token.
- **Offline support:** the phone remote has no service worker, so with no network an installed app cannot load at all. The "offline" state (item 8) only covers a page that is already open.
- **Popup "Pair with the TV" header link:** in the markup and wired to open Options, but always hidden; no code unhides it (`extension/popup.html:13`).
- **Popup connection label:** `"Living room TV"` is a fixed string, not the TV's name (`extension/popup.js:64`).
- **Home page and 401:** an unpaired browser sees the hub's 401 text as the On the TV subtitle, with no way to pair from that page.
- **Options "Test connection" with `AUTH_MODE` on:** an unpaired browser gets `"Not a tvdash hub (401)."`, which reads as a wrong URL. Inferred from the code, not observed.
- **Extension icon:** the manifest has no `icons` or `action.default_icon`, so the toolbar shows Chrome's default icon. The README calls the extension "Send to TV" and the manifest calls it "tvdash".
- **Popup height:** not set in the code. Chrome's popup size cap (about 800 × 600 px) is a browser limit, stated here from general knowledge.
- **Fonts:** only the phone remote loads Inter (Google Fonts). The sign-in page, popup, home page and options page name Inter but do not load it, so they fall back to `system-ui` unless Inter is installed on the computer.
- **Reordering Up next:** the hub has `POST /queue/move`, but no page offers it.
- **Android app other than the TV:** none. `tv/` is the Google TV app; there is no phone app. The phone remote is the installable web page.
- **`helper/`:** a local server for couch mode with no UI of its own (item 53). `scripts/` holds build, verify and measurement shell scripts with no person-facing pages; `docs/` holds only `auth.md`.
- **The TV's Pair a device screen:** TV-side and out of scope. Its QR encodes `{hub}/remote#pair={code}` (`docs/auth.md:31`); its look is in `tv/app/src/main/kotlin/dev/tvdash/ui/Pairing.kt`.
- **Line numbers** refer to the checkout as read on 2026-11-06.
