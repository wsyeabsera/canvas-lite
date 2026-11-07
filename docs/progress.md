---
sidebar_position: 5
slug: /progress
---

# Progress stream

Progress is the event log. The Hub serves it read-only over a WebSocket at `/events`, and `lite watch` prints it.

## Protocol

1. The client connects to `/events`. The token is never put in the URL.
2. Its first message must be `{"hello":{"token":"<token>","after":<seq>}}`. `after` is the last seq the client has seen (0 for none). `token` may be omitted only when the server has no `LITE_TOKEN` (local dev), or when the upgrade carried a valid page session cookie ([Login and admin](auth.md)).
3. A missing or bad hello (wrong shape, wrong token, `after` not a non-negative integer) closes the socket with code 1008. So does any later client message: the socket is read-only.
4. The server replays every event with `seq > after`, in order and gapless (read from the table in pages internally), then pushes each new event live.
5. Each message is the bare event row, with no envelope: `{"seq":8,"project":"tvdash","kind":"project.opened","payload":{...},"ts":1762400000000}`.

Events committed during the replay are not lost: the Hub keeps sending until the client has caught up, then goes live without a gap or a repeat. A client keeps the last `seq` it saw and, after any disconnect, reconnects with `after` set to it. Delivery is at least once across reconnects, so a client ignores a `seq` it already has.

## What the watcher prints

`lite watch` prints one plain line per event, never a large payload. Each line is cut to about 100 characters with `...` (as swift-canvas `format_line` does).

| Kind | Line |
|---|---|
| `ping` | `#<seq> ping` |
| `project.opened` | `#<seq> <project> opened: <name> (<kind>, <files> files)` |
| anything else | `#<seq> <kind> <project> <payload as compact JSON>` |

```
#1 ping
#7 tvdash opened: tvdash (web, 42 files)
#8 tvdash opened: tvdash (web, 44 files)
#9 build.done tvdash {"ok":true,"ms":1830,"steps":["lint","test","bundle"]...
```
