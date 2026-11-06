---
sidebar_position: 33
slug: /verify-extension-cli
---

# Verification: extension and CLI canvases against the code

Task #1971, report only. Nothing on the Lite Worker or in `/Users/yab/Hobby/tvdash` was changed. Canvases checked: `tvdash-browser-extension` (22 screens) and `tvdash-cli-and-helper` (7 screens), fetched with their html on 2026-11-06 and compared with `extension/*`, `cli/tvdash`, `helper/server.mjs`, `helper/couch.mjs` and, where a message text is built by the hub, `hub/src/media.ts` and `hub/src/http.ts`.

Verdicts: VERIFIED means copy, colours, sizes and layout match the code (sample data may still be present, listed under PLACEHOLDER). MISMATCH means at least one difference between the design and what the code does.

Totals: 18 VERIFIED, 11 MISMATCH (29 screens). Every screen carries some illustrative sample data; the PLACEHOLDER lines say which.

Shorthand: `popup.css:N` is `extension/popup.css` line N, and so on. Colour tokens are the popup's `:root` (`popup.css:2-12`): ink `#0b0b0f`, raised `#1c1c24`, text `#f5f5f7`, text-2 `#c7c7cc`, text-3 `#8e8e96`, blue `#0a84ff`, blue-fill `#0062cc`, green `#30d158`, red `#ff6961`.

## Summary

| Screen id | Name | Verdict | Mismatches |
| --- | --- | --- | --- |
| 32-extension-popup-header-and-connection | 32 Popup: header and connection | VERIFIED | 0 |
| 32b-popup-header-connecting-and-hub-unre | 32b Popup header: Connecting, Hub unreachable | VERIFIED | 0 |
| 33-extension-popup-pair-section | 33 Popup: pair section | VERIFIED | 0 |
| 34-extension-popup-video-found-on-this-p | 34 Popup: Video found on this page | VERIFIED | 0 |
| 35-extension-popup-on-the-tv-now | 35 Popup: On the TV now | MISMATCH | 1 |
| 35b-popup-on-the-tv-now-app-browser-card | 35b On the TV now: app, browser, card, link, idle | MISMATCH | 1 |
| 35-extension-popup-on-the-tv-now-shader | 35 On the TV now (shader look) | MISMATCH | 1 |
| 36-extension-popup-send-this-tab | 36 Popup: Send this tab | VERIFIED | 0 |
| 36b-popup-send-this-tab-later-error-disa | 36b Send this tab: Later, error, disabled | MISMATCH | 1 |
| 37-extension-popup-pins-and-present | 37 Popup: Pins and Present | MISMATCH | 1 |
| 38-extension-popup-couch-mode | 38 Popup: Couch mode | VERIFIED | 0 |
| 39-extension-popup-remote-and-type-box | 39 Popup: Remote and type box | VERIFIED | 0 |
| 40-extension-popup-up-next | 40 Popup: Up next | MISMATCH | 1 |
| 41-extension-options-page | 41 Options page | VERIFIED | 0 |
| 42-extension-home-page-home-html | 42 Home page (home.html) | MISMATCH | 3 |
| 43-in-page-play-on-tv-chip | 43 In-page Play on TV chip | VERIFIED | 0 |
| 43b-chip-labels-not-started-sending-on-t | 43b Chip labels | VERIFIED | 0 |
| 44-in-page-element-picker | 44 In-page element picker | VERIFIED | 0 |
| 45-presenting-a-tab-live-badge | 45 Presenting a tab (LIVE badge) | MISMATCH | 1 |
| 46-toolbar-badge-and-tooltip | 46 Toolbar badge and tooltip | MISMATCH | 1 |
| 47-right-click-menu | 47 Right-click menu | VERIFIED | 0 |
| 48-send-back-a-new-tab-opens | 48 Send-back (a new tab opens) | VERIFIED | 0 |
| cli-49-help | 49 CLI help | VERIFIED | 0 |
| cli-49b-usage-error | 49b CLI usage error (exit 2) | VERIFIED | 0 |
| cli-50-output | 50 CLI command output | MISMATCH | 3 |
| cli-51-status | 51 CLI status | MISMATCH | 1 |
| cli-52-errors | 52 CLI errors | VERIFIED | 0 |
| helper-53-messages | 53 Couch-mode helper messages | VERIFIED | 0 |
| helper-53b-console | 53b Helper console output | VERIFIED | 0 |

Mismatch screens: 11. Total mismatches: 15. The two largest are in `cli-50-output` and `42-extension-home-page-home-html`.

## Browser extension

### 32 header and connection (VERIFIED)

- Verified: every header value matches `popup.css:16-26` (padding 12/16, gap 10, mark 20px radius 6, `strong` 15px, pill padding 4/10 radius 999 font 12, dot 7px, home link 12px padding 6/8, icon button 32px with 18px stroke-2 gear). Markup and gear path match `popup.html:9-18`. "Living room TV" is hard-coded in `popup.js:64`.
- Not shown: the header link "Pair with the TV" (`popup.html:13`) is `hidden` and no script unhides it, so it never appears.
- PLACEHOLDER: none; "Living room TV" is the real fixed string.

### 32b Connecting and Hub unreachable (VERIFIED)

- Verified: "Connecting" (`popup.html:12`), "Hub unreachable" (`popup.js:67`), dot grey `#8e8e96` (`popup.css:20`, default) and red `#ff6961` (`popup.css:22`).
- The design stacks two headers with an extra divider; real popup shows one at a time.

### 33 pair section (VERIFIED)

- Verified: eyebrow "Pair with the TV", note "On the TV, open Pair a device on the toolbar, then type its six digits." (`popup.html:21-22`), section tint `rgba(10,132,255,.08)` (`popup.css:85`), input min-height 40, radius 10, border `rgba(255,255,255,.12)`, padding 0 12 (`popup.css:70`), `maxlength` 7 and placeholder `123 456` (`popup.html:25`).
- PLACEHOLDER: `123 456` is the real placeholder text, not a typed code. The design draws it in `#8e8e96`; a real placeholder uses the browser default colour.

### 34 Video found on this page (VERIFIED)

- Verified: card colours `#0f2a4d` / `#1f5fae`, radius 12, padding 12/14, margin 12/16/0, gap 12 (`popup.css:54-58`); button `#0062cc`, min-height 40, radius 10 (`popup.css:59`); copy "Video found on this page" and "Play it on the TV" (`popup.html:31,34`).
- PLACEHOLDER: the subtitle "HLS stream" is one of three real values: "HLS stream", "DASH stream", "Video file, N MB" (`streams.js:77-81`).

### 35 On the TV now (MISMATCH, 1)

- Verified: eyebrow, title 15px/600, sub 12px, times 11px mono, controls gap 14, round buttons 44px, big 56px `#f5f5f7` on `#0b0b0f`, stop `#ff6961`, labels "−10" and "+10" (`popup.css:28-40`, `popup.html:38-55`). "The TV's player" matches `popup-model.js:34`.
- MISMATCH: the scrubber is drawn as a custom 4px track `#3a3a44` with a 16px thumb and a gradient-free fill `#0a84ff`. The code uses a native range input with `accent-color: #0a84ff` and no track styling (`popup.css:33`, `popup.html:43`), so the track and thumb are the browser's own.
- PLACEHOLDER: title "YouTube: Big Buck Bunny", times 3:41 and 9:56, fill 38%.

### 35b app, browser, card, link, idle (MISMATCH, 1)

- Verified: all five sub lines and titles: "The YouTube app", "The TV's browser", "A card", "A link", "Nothing on the TV" with "The home screen" (`popup-model.js:34,49,51,53`). Stop is the only enabled control for app and browser (`popup.js:85`); disabled opacity 0.35 (`popup.css:40`); the idle case also covers steps and any other scene (`default` branch).
- MISMATCH: the disabled big button shows the pause icon (two bars). In the code `shown.playing` is undefined for every non-player scene, so `popup.js:86-87` sets the play triangle `M8 5v14l11-7z` and aria-label "Play". Only the markup default and the playing player show pause.
- PLACEHOLDER: the grey annotations after each eyebrow ("media, app (Stop only)" and so on) are design labels, not UI. Titles "YouTube: Big Buck Bunny", "Build finished", "github.com/owner/repo/pull/12" are samples (link titles show the address without scheme, `popup-model.js:58-60`).

### 35 shader look (MISMATCH, 1)

- Content matches 35. The visual treatment does not exist in code: animated blurred colour blobs (`#0a84ff`, `#BF5AF2`, `#40C8E0`), noise overlay, vignette, gradient mark, glass pill, glowing gradient fill and thumb, glass round buttons with glows. The extension has no gradient, blur, backdrop or filter anywhere (searched `extension/` for gradient, blur, backdrop, feTurbulence: no hits). The popup is flat, solid colours.
- Treat as a design proposal, not a depiction of the shipped popup.

### 36 Send this tab (VERIFIED)

- Verified: primary `#0062cc`, min-height 48, radius 12, padding 0 14, title 600 14px, sub 400 11px opacity .85; secondary `#1c1c24`, border `rgba(255,255,255,.12)`, 600 13px (`popup.css:41-45`). "Send this tab", "Play now" (`popup.html:59,62`). Sub "Plays on the TV from 3:41" matches `popup.js:157`. Result line and undo: 12px `#c7c7cc`, undo `#64b5ff` 600 12px, min-height 32 (`popup.css:46-47`). The message text `Opening "..." in the YouTube app on the TV at 3:41.` matches the hub's `playMessage` (`hub/src/media.ts:116`).
- PLACEHOLDER: title "YouTube: Big Buck Bunny" and the position 3:41.

### 36b Later, error, disabled (MISMATCH, 1)

- Verified: sub "At the time below" (`popup.js:134`); "At" label, hint "today, or tomorrow once it has passed" (`popup.html:70-72`); error "Pick a time first." in `#ff6961` (`popup.js:142`, `popup.css:53`); time input min-height 36, radius 8 (`popup.css:51`); disabled state shows "Only http(s) pages can be sent to the TV." (`payload.js:24`, `popup.js:155`) with both controls at opacity .45 (`popup.css:44`); Undo after a scheduled send exists (`payload.js:149-150`).
- MISMATCH: the "Later…" success message reads "Scheduled." The real text comes from the hub: `Playing "<title or url>" at <ISO time>.` (`hub/src/http.ts:163-170`, for example `Playing "Talk" at 2026-11-06T18:30:00.000Z.`). The popup shows `result.text` unchanged (`popup.js:146`).
- PLACEHOLDER: time `18:30`; the three-section captions ("Later… with no time" and so on) are design labels. `--:--` is the native empty time input.

### 37 Pins and Present (MISMATCH, 1)

- Verified: eyebrow with hint "a live part of this page on the TV", buttons "Pin part of this page", select text "every minute" (default `selected`, options 30 s, minute, 5 min, 15 min, `popup.html:77-86`), "Present this tab on the TV"; grid `minmax(0,1fr) auto` gap 8, min-height 44, font 12 (`popup.css:60-62`); list rows min-height 40, top border, remove button 44 by 40, 18px `#8e8e96` (`popup.css:63-66`).
- MISMATCH: button labels are left-aligned in the design ("Pin part of this page", "Present this tab on the TV" with `justify-content:flex-start`). The code styles them as plain buttons (`popup.css:45`), whose text is centred.
- PLACEHOLDER: pin titles "Weather: Berlin forecast" and "Match score: live ticker".

### 38 Couch mode (VERIFIED)

- Verified: hint "Claude makes this page TV-friendly", three buttons "Cook along", "Summarize", "Find a video" on a 3-column grid gap 8 min-height 44 padding 0 8 font 12 (`popup.css:67-68`); input placeholder "Put the ingredients on the TV, doubled" (`popup.html:101`); result "Claude is reading the page… (you can close this)" (`popup.js:201`).
- PLACEHOLDER: the placeholder text is drawn as grey typed text; the real placeholder colour is the browser default.

### 39 Remote and type box (VERIFIED)

- Verified: hint "arrows · Enter · Esc · Space work too"; pad 3 columns of 56px, rows 44px, gap 8, centred (`popup.css:71`); key order Menu, up, Back, left, OK, right, empty, down, play-pause (`popup.html:108-116`); small keys 11px `#c7c7cc`, OK `#2c2c36` (`popup.css:72-74`); placeholder "Type on the TV: Enter sends it and presses Enter" (`popup.html:120`); result format `Typed "<text>" on the TV.` (`popup.js:233`).
- PLACEHOLDER: the typed text "lofi beats". The keyboard also maps Backspace to Back and "m" to Menu (`popup-model.js:10-13`); not in the hint.

### 40 Up next (MISMATCH, 1)

- Verified: eyebrow "Up next", row min-height 44, top border except the first, number column 14px mono 11px, remove "×" 44px 18px (`popup.css:76-81`).
- MISMATCH: the second row shows "example.com/recipes/pasta" (scheme stripped). The popup prints `item.title ?? item.url` raw (`popup.js:98`), so an untitled item shows the full URL including `https://`. Only the status card strips the scheme (`popup-model.js:58-60`).
- PLACEHOLDER: all three titles.

### 41 Options page (VERIFIED)

- Verified: labels and strings "tvdash hub URL", "Save", "Test connection", "Pair with the TV", "Pair", "Forget pairing"; status `The hub answers; the TV shows: media.` (`options.js:41`); `Paired with the TV as "<name>".` (`options.js:67`); hub value equals `DEFAULT_HUB` (`payload.js:4`); font 14px system-ui, h2 14px margin 20/0/4, p colour `#57606a`, row gap 8 margin-top 10, code field 9em with `.2em` letter spacing and tabular figures (`options.html:8-17`).
- PLACEHOLDER: the device name "Brave on macOS" (real format, from `deviceName`, `auth.js`). The 2px grey input and button borders are an approximation of browser default controls, which the code does not style. The 720 by 640 white page is a stand-in: `manifest.json` sets `open_in_tab: false`, so Chrome shows the page inside the extensions dialog.

### 42 Home page (MISMATCH, 3)

- Verified: palette `#0d0f0e`, `#151917`, `#eef2ef`, `#b8c0ba`, `#8e978f`, `#30d158` (`home.css:2-10`); clock 72px/700 `-0.03em`, cards radius 20 padding 22/24, h2 12px/700 uppercase, search min-height 52 radius 14 with the 2px green focus ring (the page focuses it on load, `home.js:149`), bar 6px high, button min-height 44 radius 12, list rows 48 with top border, 3 columns at 1280 (`home.css:13-46`). All card titles and buttons match (`home.html`), including "Pause", "Stop", "Bring it here", "Remove", "Cancel", "Play on TV", "Open here", "3:41 of 9:56" (`home.js:49`), and "from browser", "from phone" (`home.js:76`), "3 actions", "1 action" (`home.js:118`).
- MISMATCH 1: the Scenes "Run" buttons are drawn quiet (outlined). The code gives them no quiet flag (`home.js:119`), so they render as the solid light button.
- MISMATCH 2: the result line "Sent back to the browser." The hub answers `Sent "<title or url>" back to your laptop[ at m:ss].` (`hub/src/http.ts:239`); `home.js:26` shows it as is.
- MISMATCH 3: the Up next and Scheduled labels are drawn scheme-less ("example.com/recipes/pasta", "Play example.com/news"). The code prints `item.title ?? item.url` raw (`home.js:80,85`), so an untitled item shows `https://...`.
- Locale dependent, so not comparable: clock "19:42" and date "Friday, 6 November" come from `toLocaleTimeString` and `toLocaleDateString` with the browser locale (`home.js:40-41`); the schedule meta "Sat, 07:30" from `toLocaleString` (`home.js:86`). Punctuation and 12/24 hour format vary by locale.
- PLACEHOLDER: every title, time and count; the row header "Continue watching" is a real hub row title (`hub/src/screen.ts:682`; siblings "Sent to the TV" and "From Claude"). The empty-state texts and the hub-unreachable state are not shown in the design.

### 43 In-page Play on TV chip (VERIFIED)

- Verified: chip min-height 32, padding 6/12, radius 999, background `rgba(11,11,15,.86)`, border `rgba(255,255,255,.28)`, font 600 12px system-ui, icon 14px stroke 2.4 with the same rect and path (`content.js:15-21`); position top-right 12px inside the video (`content.js:42-43`); "Play on TV from 3:41" format (`content.js:26-34`).
- Not shown: the chip hides after 2500 ms without movement (`content.js:6`) and only appears on videos at least 200 by 120.
- PLACEHOLDER: the page, the video and the position 3:41.

### 43b chip labels (VERIFIED)

- Verified: "Play on TV", "Sending…", "On the TV", "Couldn't send" (`content.js:29,90,93,96`); hover and focus background `#0062cc` (`content.js:18`).
- PLACEHOLDER: the label "Play on TV (hover / focus)" is a design annotation.

### 44 Element picker (VERIFIED)

- Verified: outline 3px `#0a84ff`, fill `rgba(10,132,255,.12)`, radius 4; label `#0b0b0f`, white, 600 12px, padding 6/10, radius 6, placed 34px above the box; label text `div 800×200 · click to pin · ↑ bigger · Esc cancel` (`picker.js:8-9,17-18`).
- Note: the box is `position:fixed` with default sizing, so the 3px border adds 6px to the element's size on pages without a global border-box reset; the design draws it flush. Page-dependent, not decidable from the code alone.
- PLACEHOLDER: the page and the size 800×200.

### 45 Presenting a tab, LIVE badge (MISMATCH, 1)

- Verified: badge text "LIVE" in green `#1a7f37` (`background.js:168,403`), tooltip `Send to TV` plus line `Presenting this tab on the TV. Esc in the page stops.` (`background.js:168,405`); no overlay in the page (`picker.js:83-119` draws none).
- MISMATCH: the design shows LIVE as a standing badge while presenting. `showResult` clears the badge after 5 s (`background.js:406`), so LIVE shows for about 5 seconds, not for the whole presentation. (Esc clears it earlier, `background.js:195`.)
- PLACEHOLDER: the page ("Q4 review", `example.com/slides/q4-review`). The browser frame, 16px badge geometry and tooltip box are Chrome UI, not defined by the extension.

### 46 Toolbar badge and tooltip (MISMATCH, 1)

- Verified: badge texts YT, TW, NF, APP, WEB, OK and the player glyph (`payload.js:53-58`); "TV" for couch mode (`background.js:372`), "LIVE", "ERR"; colours ok `#1a7f37`, error `#cf222e`, stream found `#0062cc` (`background.js:47,403`); tooltip format `Send to TV` newline text (`background.js:405`); error text "The TV can only open http(s) links." (`background.js:246`); "Alt+Shift+T" (`manifest.json`); 5 s timeout (`background.js:406`).
- MISMATCH: row 1 pairs the player glyph with the YouTube app message (`Opening "YouTube: Big Buck Bunny" in the YouTube app on the TV.`). An app open gets the badge `YT` (`payload.js:58`); the player glyph goes with `Playing "..." in the TV's player.` (`media.ts:114`).
- PLACEHOLDER: the Chrome toolbar chrome (32px icon, "T" letter icon, 16px badge, dark tooltip) is browser UI. The extension ships no icon files, so Chrome draws a letter icon.

### 47 Right-click menu (VERIFIED)

- Verified: parent "tvdash"; items in order: "Play on TV", "Add to Up next", "Show as a card with a QR code", "Play the video only (no page)", "Open in the TV browser, ad-free", "Show the selected text on TV" (`background.js:229-237`). The selection item appears only with selected text, as in the design.
- PLACEHOLDER: the page, the highlighted text and the surrounding Chrome items "Back", "Copy", "Inspect"; menu geometry is Chrome UI.

### 48 Send-back (VERIFIED)

- Verified: a new tab opens at the TV's position via `resumeUrl`, YouTube gets `t=<seconds>s` appended (`payload.js:70-77`); 221 s equals 3:41. The check runs every 30 s (`background.js:265-273`).
- PLACEHOLDER: video id, tab titles, progress bar and the caption (a design annotation).

## CLI and helper

### 49 CLI help (VERIFIED)

- Verified: the usage text is byte-identical to `USAGE` in `cli/tvdash:10-26`. This was checked by running `node cli/tvdash help` (read-only) and diffing it with the canvas text (1396 characters each, no difference). `help`, `-h` and `--help` print it and exit 0 (`cli/tvdash:165-168`).
- PLACEHOLDER: the terminal frame, traffic-light dots, window title and the `$` prompt are drawn by the design.

### 49b usage error (VERIFIED)

- Verified: `tvdash: unknown command "frob"`, a blank line, then the full usage, exit 2 on stderr (`cli/tvdash:267-269`). All eight other first lines match the source strings: no command (`:163`), unknown option (`:109`), needs a value (`:114`), takes one URL (`:172`), `--when takes 20:00 or +10m, not "soon"` (`:178`), `--at: "soon" is not a time (use 90, 1m30s or 1:30)` (`:129`), `--kind is info, success or warning` (`:222`), `pair takes the six digits the TV shows: tvdash pair 123456` (`:236`).
- PLACEHOLDER: "frob", "--x", "soon". The design uses a 12px/1.3 font here and 13px/1.5 elsewhere; terminal styling is not defined by the code.

### 50 command output (MISMATCH, 3)

- Verified: `Playing "Talk" in the TV's player from 1:30.` (`hub/src/media.ts:114`); `Stopped "Talk"; the TV shows the idle screen.` (`hub/src/screen.ts:781`); "Nothing scheduled." and "No scenes yet." (`cli/tvdash:195,205`); scene lines `Movie night (3 actions)` and `Morning news (1 action)` (`:187`); `Paired as "tvdash on <host>". The token is in <path>.` (`:247`); the unpair line (`:254`).
- MISMATCH 1: `Scheduled for 20:00 (id k3f9a2).`. The code prints `Scheduled for ${at.toLocaleString()} (id ${reply.id}).` (`cli/tvdash:179`), a full local date and time, for example `11/6/2026, 8:00:00 PM` (locale dependent), not `20:00`.
- MISMATCH 2: the `tvdash schedule` row `20:00  queue  https://example.com/next.mp4  (k3f9a2)`. The code prints `new Date(i.at).toLocaleString()` first (`cli/tvdash:195`), so the first column is a full date and time as above. The rest of the format (two-space gaps, action, title or url, id in parentheses) matches.
- MISMATCH 3: the `--claude-code` output prints the `claude mcp add ...` line flush left. The code indents it two spaces (`cli/tvdash:243`: blank line, then `  claude mcp add --transport http tvdash <hub>/mcp --header "Authorization: Bearer <token>"`).
- PLACEHOLDER: id `k3f9a2`, hostname "macbook" (the real value is `os.hostname()`, often `name.local`), path `/Users/you/.config/tvdash/config.json`, token `<token>`, and the URLs and titles.

### 51 status (MISMATCH, 1)

- Verified: formats `idle (clock and recent activity)`, `card (success): Build finished`, `link: <title>` plus `  <url>`, `media (player): <title>` with url line and `  playing 1:12 / 3:45, reported 2s ago`, the live form `playing 12:05 (live), reported 1s ago`, `media (youtube app): ...` with `no report from the TV yet (only the TV's player reports)`, and `steps (this tvdash does not know that scene)` (`cli/tvdash:269-299`). "Up next:" with `  1. <title>` lines (`:263-267`). Source labels "claude", "browser", "cli", "phone", "tv" or none for "other" (`hub/src/protocol.ts:115`).
- MISMATCH: `2. Highlights (from tvdash on macbook)`. The suffix is the queue item's `source`, which is one of claude, browser, cli, phone, tv, other; a device name never appears. An item queued by the CLI shows `(from cli)`.
- PLACEHOLDER: all titles, urls, positions, "2s ago" and "1s ago", the video id `abc123`.

### 52 errors (VERIFIED)

- Verified: all four messages follow the code's formats: `cannot reach the hub at <hub> (<code>); set TVDASH_HUB to change it` (`cli/tvdash:147`), the not-paired line (`:156`), `the hub answered <status>: <error or body>` (`:157`), `the hub at <hub> did not answer JSON; is TVDASH_HUB a tvdash hub?` (`:158`). Printed on stderr with exit 1 (`:272-273`).
- PLACEHOLDER: `ENOTFOUND` (a real Node error code, but one of several), and `internal error` after `500:` (the body text depends on the hub; the code defines only the prefix).

### 53 couch-mode helper messages (VERIFIED)

- Verified: every line exists in the code. Extension side: "Claude is reading the page… (you can close this)" (`popup.js:201`), "This page can't be read (a browser page or a PDF viewer)." (`background.js:369`), "The tvdash helper isn't running. In the project's helper/ folder: npm start" (`couch.js`). Helper side (`helper/server.mjs`): "Only the tvdash extension may use this helper." (line 41), "The page is too big to send.", "The body must be JSON.", "No page to read.", "The hub must be an http(s) address.". Claude side (`helper/couch.mjs:74-85`): "Nothing to ask.", "Claude stopped without an answer.", "Claude took too many steps; nothing more was sent.", `Claude stopped: <reason>`, `Claude Code could not run: <first line>`, and "Done." as the empty-result fallback. Error colour `#ff6961` (`popup.css:53`).
- PLACEHOLDER: the design draws each message as a row with a divider and padding 7/16; in the popup they appear one at a time in the single result line. Angle-bracket parts are the variable text.

### 53b helper console (VERIFIED)

- Verified: start line `tvdash helper on http://127.0.0.1:8790 (Claude Code: <path or built-in>)`, then `couch <action> <url>` and `  done: <text>` or `  failed: <text>` (`helper/server.mjs`, the `console.log` calls). Port 8790 is the default (`TVDASH_HELPER_PORT`).
- PLACEHOLDER: `/usr/local/bin/claude` (output of `which claude`), the urls, and the result texts "Put the ingredients on the TV as 6 steps." (Claude's free-form last sentence).

## Unclear or not verifiable

- Font rendering: the popup font is `Inter, system-ui`; the design used the same stack, so pixel width of text depends on whether Inter is installed. The `<select>` widths in 36 and 37 depend on the widest option; the design draws them at the selected text width.
- Browser-owned UI: native range input (35), time input (36b), default form-control borders and button faces (41), Chrome toolbar, badge and tooltip (45, 46), the context menu frame (47), the tab strip (48). The code defines none of this; the design values are approximations.
- Locale-formatted text: clock, date and schedule meta in the home page (42) and the schedule time in the CLI (50) depend on the user's locale and cannot match one fixed string.
- Hub-written messages beyond those read: the send results shown in 36 and 42 are built by the hub (`hub/src/media.ts`, `hub/src/http.ts`); only the formats cited above were compared. Other hub messages (for example the card and link texts) were not compared.
- The `/status` answer for an unpaired browser: 33 draws a green "Living room TV" pill next to the pair section. `options.js:37` says `/status` allows any origin, which supports that, but the hub's auth rules were not read.
- Pin and queue item shapes (`title`, `source`) come from the hub at runtime; the sample rows are plausible but not checkable against code.
- Element picker box sizing (44) depends on the host page's CSS.
- The shader variant (35) is a visual proposal; whether it is meant to ship is a design decision, not a code question.
