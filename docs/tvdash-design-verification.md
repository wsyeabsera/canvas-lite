---
sidebar_position: 29
slug: /tvdash-design-verification
---

# Design verification

The tvdash screens on the Lite canvases were compared, screen by screen, with the real tvdash code (report only: no screen and nothing in tvdash was changed). Each screen is marked **verified**, **mismatch** (with the exact difference and `path:line`), and lists its **placeholder** sample data, which the code does not define.

| Canvases | Doc | Screens | Verified | With mismatches | Mismatches |
|---|---|---|---|---|---|
| TV: Home, cards, link, GitHub and TV: Player | [verify-tv-home-player](verify-tv-home-player.md) | 31 | 24 | 7 | 11 |
| TV: Browser and TV: Steps, wall, pairing, voice, keys | [verify-tv-browser-steps](verify-tv-browser-steps.md) | 19 | 6 | 13 | 29 |
| tvdash phone remote | [verify-phone-remote](verify-phone-remote.md) | 33 | 4 | 29 | 90 (plus 7 shared findings) |
| tvdash browser extension and CLI | [verify-extension-cli](verify-extension-cli.md) | 29 | 18 | 11 | 15 |
| **Total** | | **112** | **52** | **60** | **145** |

## What the pattern is

- **Copy and colours are mostly right; geometry is the usual gap.** Most mismatches are glyph drawings, spacing, alignment, focus-ring offsets and toolbar contents. The toolbar has 9 buttons in the code; several designs draw 5 or 7. The focus ring is a 3 dp ring 4 dp outside the item in the code and is drawn with no gap in the designs.
- **The phone remote is the least faithful (29 of 33 screens).** The largest class is invented text: the activity summaries, the hub's result messages (the code uses straight quotes and includes the label), the send flow's field clearing, and the app icon geometry.
- **Some invented behaviour.** The CLI schedule output (the code prints a full local date and time), the extension's LIVE badge (cleared after 5 seconds), and a "Scheduled." result the hub never returns.
- **The extension has no gradient, blur or filter**, so the shader-look extension popup shows something the real popup does not do today.
- **Placeholder data is everywhere** (titles, hosts, times, counts, QR modules); each screen's list says which values are illustrative.

## What was not verified

Anything drawn by the operating system or the browser (lock screen, installed-app icon frame, Chromium full-screen video), locale-dependent formats, QR decoding, real TV rendering, and the Android and performance claims in [the shader notes](tvdash-shader-variants.md), which need a device.
