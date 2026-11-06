---
sidebar_position: 2
slug: /architecture
---

# Lite architecture (phase 1)

Goal of phase 1: Claude, from the terminal, opens a project; anyone with the token watches it happen. Nothing else.

```
Claude Code ──MCP (Streamable HTTP, /mcp)──▶ Cloudflare Worker ──▶ Hub (Durable Object, SQLite)
                                                   │                      │
browser  ◀── static watch page (/)  ───────────────┤                      │
lite watch / watch page ◀── WebSocket (/events, read-only) ───────────────┘
```

Everything runs on Cloudflare and is deployed with `wrangler deploy`. One Durable Object, the Hub, owns all state. It is
the only writer, so event order is the order of insertion. This is the shape tvdash's hub already proved (MCP `/mcp`,
a socket, one SQLite Durable Object).

## Event model

Every change is one appended row; nothing is updated in place, so "progress" is just reading the log.

`projects(id, name, path, kind, opened_at)` and `events(seq INTEGER PRIMARY KEY AUTOINCREMENT, project, kind, payload JSON, ts)`.

A tool call writes its event(s) in the same transaction as its effect, then the Hub broadcasts the committed rows.
The WebSocket envelope is the row: `{seq, project, kind, payload, ts}`. A client connects with `?after=<seq>` and
gets the missed rows, then live ones. Replay from the table is why the stream needs no separate buffer.

## Projects are told, not read

A Worker cannot read your disk. Claude reads the local checkout and tells Lite about it: `open_project(name, manifest)`
registers the project and a manifest (file tree, key files). Lite stores that summary, never file contents.
The spec is written in Lite 1 (design first).

## Stack

| Piece | Choice | Why |
|---|---|---|
| Host | Cloudflare Workers + one Durable Object, deployed with wrangler | one deploy ships app, watch page and docs; hibernating WebSockets cost nothing idle |
| Language | TypeScript | same as tvdash; reuse its hub code |
| Database | Durable Object SQLite (`ctx.storage.sql`) | no separate database to run |
| MCP | official `@modelcontextprotocol` TypeScript SDK | transport and schema handling already written |
| Tests | `node:test` on `node:sqlite` | store logic takes a tiny `sql` interface, so unit tests run in plain Node, not workerd |

## What we take from swift-canvas and tvdash

- swift-canvas `helper/src/live.rs` LiveHub: sequence numbers, a bounded queue per subscriber, a reported `dropped` count instead of silent loss. A slow watcher is told it missed events and re-reads from the table.
- swift-canvas `format_line`: one plain line per event, never large payloads. Used by `lite watch`.
- swift-canvas `mcp.rs` limits (message and argument size caps). Kept as server limits.
- tvdash `hub/`: wrangler config, the MCP and Durable Object wiring, the vitest setup.

Dropped: the helper-to-app relay, browser tokens and origins, op batches, undo, the Chrome extension. None apply here.

## Rules

- Read-only watchers: the WebSocket accepts no client messages that change state.
- One bearer token (a wrangler secret, `LITE_TOKEN`) is required on `/mcp` and `/events`, compared in constant time. `/health` needs no token and reveals nothing.
- Project ids are validated (lowercase letters, digits, `-`, at most 40); manifests have a size limit.
- Never put the token in a query string; the watch page reads it from the URL fragment.

## Fast loop (from ws-command's Faster development)

- `npm run check` = typecheck + all unit tests, under 10 s. `npm test -- <word>` runs one module.
- `npm run test:changed` = typecheck + unit files that import what changed, with an input-hash cache; the pre-merge gate.
- Only unit tests. No Playwright, no e2e, no smoke tests. Code that needs workerd or a browser keeps its logic in pure functions covered by unit tests and is checked by hand once.
- Unit tests use their own in-memory or temp database. No test is deleted to save time; wait for conditions, never sleeps.

## Not in phase 1

Any UI beyond the read-only watch page, editing, rendering, themes, templates, export, multi-user, auth beyond the token.
