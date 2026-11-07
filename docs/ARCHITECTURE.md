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

`projects(id, name, kind, repo, manifest, opened_at)` and `events(seq INTEGER PRIMARY KEY AUTOINCREMENT, project, kind, payload JSON, ts)`.

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

## MCP transport and structure

`/mcp` is MCP **Streamable HTTP**: Claude POSTs JSON-RPC and the Worker answers with a stream (server-sent `message` frames),
so a tool call can emit progress before its result. This is the only transport a Worker can offer, and Claude Code, the
Claude apps and connectors all speak it.

- **Stateless.** Each request builds a fresh `McpServer` (`src/mcp.ts`) and holds no session: any isolate can answer any request, and a deploy never drops a session. All state lives in the Hub.
- **Thin tools.** A tool validates its input with zod and calls one Hub method; the rules live in pure functions (`src/projects.ts`, `src/store.ts`) that unit tests cover. Errors are returned as `isError` tool results carrying the spec's message.
- **Push is not MCP's job.** Lite offers no server-initiated `GET /mcp` stream (it would need sessions). Live progress goes over the `/events` WebSocket, which any watcher can open.
- **Growing the tool list.** While `src/mcp.ts` holds a handful of tools it stays one file; past that, one file per area under `src/tools/`, each exporting `register(server)`.
- **Registering it.** `claude mcp add --transport http <name> <url>/mcp` (add `--header "Authorization: Bearer <token>"` for the deployed Worker).

## What we take from swift-canvas and tvdash

- swift-canvas `helper/src/live.rs` LiveHub: sequence numbers, a bounded queue per subscriber, a reported `dropped` count instead of silent loss. A slow watcher is told it missed events and re-reads from the table.
- swift-canvas `format_line`: one plain line per event, never large payloads. Used by `lite watch`.
- swift-canvas `mcp.rs` limits (message and argument size caps). Kept as server limits.
- tvdash `hub/`: wrangler config, the MCP and Durable Object wiring, the vitest setup.

Dropped: the helper-to-app relay, browser tokens and origins, op batches, undo, the Chrome extension. None apply here.

## Rules

- Read-only watchers: the WebSocket accepts no client messages that change state. (The page itself writes only to `/login`, `/logout` and the admin archive: see [Login and admin](auth.md).)
- One bearer token (a wrangler secret, `LITE_TOKEN`) is required on `/mcp`, `/events` and `/api`, compared in constant time. `/health` needs no token and reveals nothing. The watch page may instead sign in with a password (`LITE_PASSWORD`) and hold a signed session cookie that works on `/api` and `/events` but never on `/mcp`; with a password set the Worker also serves the static files, the docs included, only to a session ([Login and admin](auth.md)).
- Project ids are validated (lowercase letters, digits, `-`, at most 40); manifests have a size limit.
- Never put the token in a query string; the watch page reads it from the URL fragment.

## Fast loop (from ws-command's Faster development)

- `npm run check` = typecheck + all unit tests, under 10 s. `npm test -- <word>` runs one module.
- `npm run test:changed` = typecheck + unit files that import what changed, with an input-hash cache; the pre-merge gate.
- Only unit tests (node:test, plain Node). No Playwright, e2e or smoke tests; the full suite is all the unit tests. Anything that needs workerd or a browser is verified by hand once, and its logic lives in pure functions the unit tests cover.
- `npm run test:inventory` fails if the unit test count drops below `test/inventory.json`; `npm run ship:local` runs the gate and fast-forwards main from a `ws/` branch.
- Unit tests use their own in-memory or temp database. No test is deleted to save time; wait for conditions, never sleeps.

## Link extraction

Several modules read `data-to` out of screen html. They look alike but differ on purpose, so they are not merged:

- `src/canvases.ts` `extractLinks` (and `hasBackLink`): the server's reading. Strips comments first, tolerates `>` inside quoted attribute values, returns `{ to, transition }` with the raw transition (null when absent). Used by validate_flow, review and dangling-link warnings. It lives next to the Worker-side SQL code, so `web/` cannot import it.
- `web/links.ts` `extractLinks` / `readLink` / `danglingTargets`: the page's reading. Validates the id (`[a-z0-9-]{1,40}`), normalises the transition and adds `back`. Its regex pass does not strip comments and stops at a quoted `>`, so its results differ from the server's on odd html. `readLink` is also what `web/play.ts` uses on DOM attributes.
- `src/scenarios.ts` `linkControls` (element text and label per link) and `src/coverage.ts` `scanControls` (every control, linked or not, with an element stack): different return shapes and purposes, not duplicates.

Merging the first two would change what one side accepts (comments, quoted `>`, id validation), so they stay separate until a behaviour change is wanted.

## Not in phase 1

Any UI beyond the read-only watch page, editing, rendering, themes, templates, export, multi-user, auth beyond the token.
