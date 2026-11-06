---
sidebar_position: 1
slug: /
---

# Lite

Lite is a from-scratch, small-steps rebuild of swift-canvas. Claude drives it from the terminal over MCP; the only
view is read-only (a terminal watcher and a Chrome side panel).

## Run it

```sh
npm run db:init   # creates ~/.lite/lite.db (set LITE_HOME to use another folder)
npm test          # unit tests, each on its own temp database
```

`lite serve`, the MCP server and the watcher arrive in the next tasks; this page grows with them.

## Where to read next

- [Architecture](ARCHITECTURE.md): the shape, the stack and what we reuse.
- [Database](database.md): tables, the event model and migrations.

## Rules of the project

Each slice is used before the next one starts. Docs change in the same commit as the code.
