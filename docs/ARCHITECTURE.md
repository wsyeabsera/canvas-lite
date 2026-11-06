# Lite architecture (phase 1)

Goal of phase 1: Claude, from the terminal, opens a project; a second terminal watches it happen. Nothing else.

```
Claude Code ──MCP (Streamable HTTP, /mcp)──▶ lite serve ──WebSocket (/events, read-only)──▶ lite watch
                                              │
                                              └── SQLite (one file, WAL)
```

One process, `lite serve`, owns everything. It is the only writer of the database, so event order is simply the
order of insertion. This is the shape tvdash's hub already proved (MCP `/mcp` + a socket + one store).

## Event model

Every change is one appended row; nothing is updated in place, so "progress" is just reading the log.

`projects(id, name, path, kind, opened_at)` and `events(seq INTEGER PRIMARY KEY AUTOINCREMENT, project, kind, payload JSON, ts)`.

A tool call writes its event(s) in the same transaction as its effect, then the server broadcasts the committed rows.
The WebSocket envelope is the row: `{seq, project, kind, payload, ts}`. A client connects with `?after=<seq>` and
gets the missed rows, then live ones. Replay from the table is why the stream needs no separate buffer.

## Stack (recommendation, owner decides)

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node 24, TypeScript run directly (type stripping) | already installed, no build step, same language as tvdash |
| Database | `node:sqlite` | built in, zero dependency, WAL gives one writer plus many readers |
| MCP | official `@modelcontextprotocol` TypeScript SDK | transport and schema handling already written |
| WebSocket | `ws` | Node has no WebSocket server |
| Tests | `node:test` | built in |

Three runtime dependencies at most. The alternative is Rust, which reuses swift-canvas code verbatim, but it needs a build
step and hand-rolled MCP for no phase-1 gain; Rust comes back only if the canvas core needs it later.

## What we take from swift-canvas

- `helper/src/live.rs` LiveHub: sequence numbers, a bounded queue per subscriber, and a reported `dropped` count instead of silent loss. Kept as an idea: a slow watcher is told it missed events and re-reads from the table.
- `helper/src/live.rs` `format_line`: one plain line per event, never large payloads. Kept for `lite watch`.
- `helper/src/mcp.rs` limits (message and argument size caps). Kept as server limits.
- `helper/src/store.rs` ids that cannot escape the directory and atomic writes. Kept: project ids are validated; SQLite gives atomicity.

Dropped: the helper-to-app WebSocket relay, tokens/origins for a browser, op batches, undo. None apply with no UI.

## Rules

- Read-only watcher: the WebSocket accepts no client messages that change state.
- Listens on `127.0.0.1` only; a random token in the data dir is required on `/mcp` and `/events`.
- Paths given to `open_project` are resolved and must be existing directories; the tool never writes into them.
- Data dir: `~/.lite/` (`lite.db`, `token`).

## The extension, from group 0

A Chrome MV3 extension (`extension/`, started from swift-canvas's manifest) has a side panel that connects to `/events` and
lists events as they arrive. It is read-only and ships in Lite 0 so progress is visible from the first `ping`. The server
accepts its `chrome-extension://<id>` origin on loopback instead of asking for a token.

## Fast loop (from ws-command's Faster development)

- `npm run check` = typecheck + all unit tests, under 10 s. `npm test -- <word>` runs one module.
- `npm run test:changed` = typecheck + unit files that import what changed, with an input-hash cache; the pre-merge gate.
- No e2e by default: one smoke test (serve, ping, ws client). The full suite runs nightly and in CI only.
- Unit tests open a db in their own temp dir, never `~/.lite`. No test is deleted to save time; wait for conditions, never sleeps.

## Not in phase 1

Any UI beyond the read-only side panel, editing, rendering, themes, templates, export, multi-user, auth beyond loopback and the token.
