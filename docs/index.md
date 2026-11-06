---
sidebar_position: 1
slug: /
---

# Lite

Lite is a from-scratch, small-steps rebuild of swift-canvas. Claude drives it from the terminal over MCP, hosted on Cloudflare; the only
view is read-only (a web page the Worker serves and a terminal watcher).

## Run it

```sh
npm install
npm run dev     # wrangler dev on http://127.0.0.1:8790 (MCP at /mcp, health at /health)
npm test        # unit tests, each on its own in-memory database
claude mcp add --transport http lite http://127.0.0.1:8790/mcp
```

Then ask Claude to call the `ping` tool: it appends an event in the Hub and returns it. Deploying, the watch page and
`lite watch` arrive in the next tasks; this page grows with them.

## Where to read next

- [Architecture](ARCHITECTURE.md): the shape, the stack and what we reuse.
- [Database](database.md): tables, the event model and migrations.

## Rules of the project

Each slice is used before the next one starts. Docs change in the same commit as the code.
