# Lite

Read `docs/ARCHITECTURE.md` first (the "Fast loop" section covers this file's rules).

## Testing

Only unit tests (node:test, plain Node). Never add Playwright, e2e or smoke tests. Anything that needs workerd or a browser is verified by hand once and its logic is kept in pure functions that unit tests cover.

## Scope

Desktop browsers only. Phones and tablets are out of scope for now: do not design, test, or spend time on narrow widths. (Existing responsive CSS stays; just don't extend or verify it.)

## Shaders

The `shaders` agent skill is in `.agents/skills/shaders`. Use only the MIT `shaders` npm package (plain `npm install`). Never run `npx shaders connect|install|update` or sign in: the owner does not want a Shaders account, so ignore the skill's CLI and account steps.

## The loop

| Command | What it does | Time |
| --- | --- | --- |
| `npm run check` | typecheck + all unit tests, prints elapsed time | about 0.5 s, target under 10 s |
| `npm run test:changed` | typecheck + inventory guard + only unit files that (transitively) import what changed vs main (committed, uncommitted, untracked) | under 1 s, cached files skipped |
| `npm run test:changed -- --list` | print the plan, run nothing | instant |
| `npm run test:changed -- --no-cache` | ignore the input-hash cache | |
| `npm test -- <word>` | only test files whose name contains the word | |
| `npm run test:inventory` | fail if the unit test count is below `test/inventory.json` | instant |
| `npm run ship:local` | from a `ws/` branch: refuse if uncommitted, run test:changed, fast-forward main, push main only if `origin` exists (`-- --dry-run` to preview) | |

`test:changed` runs all tests when a test file, `package.json` or a tsconfig changed, or when a file nothing imports changed (a wrong guess must never skip a test). The cache lives in `.lite-cache/unit.json` (gitignored): a test file whose content, every transitive import, the node version and `package-lock.json` are unchanged since its last green run is reported as "N from the cache". A failure is never cached. The merge gate (`ship:local`) never reads it.

## Rules

- Never delete a test to save time. If the count must drop, `npm run test:inventory -- --reason "<why>"` records it.
- Unit tests use their own in-memory or temp database (`test/node-sql.ts`), never a shared one.
- Wait for conditions, never sleeps.
- Docs change in the same commit as code. When `docs/` or `site/` changed, `cd site && npm run build` must pass.
- Do not edit `src/` just to make the scripts easier; the import graph is scanned from `import ... from "<relative path>"` statements in every top-level code folder (`src/`, `test/`, `cli/`, `scripts/`).

## Debugging the watch page

The project `.mcp.json` registers the Chrome DevTools MCP server (pinned `chrome-devtools-mcp@1.12.0`). The watch page is vanilla TypeScript, not React, so the React DevTools add-on (`react-devtools-cdt-mcp`) has nothing to inspect and is not installed.

1. Start `npm run dev` and open http://127.0.0.1:8790/. Local dev needs no auth; the deployed Worker needs `#token=` in the URL once.
2. Use the Chrome DevTools MCP tools: `take_snapshot`, `list_console_messages`, `list_network_requests`, `take_screenshot`, `evaluate_script` (also `performance_start_trace`).
3. Desktop only (see Scope); do not resize to phone widths.

Expected console noise, harmless: a CSP eval refusal and a TypeGPU fallback line from the shader backdrop.
