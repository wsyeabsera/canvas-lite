# lite

A from-scratch, small-steps rebuild of swift-canvas. Terminal first: no UI beyond a read-only progress view.

Order: foundation (MCP + database) → open a project → watch progress over websockets → dogfood on tvdash.
Rule: nothing starts until the slice before it has been used.

## Use it in another project

One-time, in this checkout: `npm link` (puts `lite` on your PATH). Then, from any project:

```
lite init [dir] [--url <worker url>] [--devtools]
export LITE_TOKEN=<your token>
```

`lite init` merges the `lite` MCP server into `<dir>/.mcp.json` (the header is `Bearer ${LITE_TOKEN}`, never a token value) and copies the skills and the `/prototype`, `/scene`, `/tournament` commands into `<dir>/.claude/`. Re-run it to update. Details: [docs/plugin.md](docs/plugin.md).
