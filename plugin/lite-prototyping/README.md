# lite-prototyping (Claude Code plugin)

Makes Claude build complete, product-wired prototypes in [Lite](../../docs/index.md) instead of half-finished screens.

It contains:

- `skills/prototyping/SKILL.md`: the process skill (brief and journeys, screen and state inventory, one nav, one `set_screens` pass, `validate_flow` then `review_prototype` until ok and score 90+, tours, only then present).
- `commands/prototype.md`: `/prototype <what to design>` runs that process.
- `.mcp.json`: a template for the Lite MCP server. It holds no token.

## Install

1. Deploy Lite (`npm run deploy`) and note your Worker URL. Edit `.mcp.json` and replace `https://<your-worker>/mcp` with it (local dev: `http://127.0.0.1:8790/mcp`).
2. Set the token in your shell, never in a file you commit: `export LITE_TOKEN=<your Lite token>`.
3. Add the plugin from this folder, either way:
   - try it without installing: `claude --plugin-dir ./plugin/lite-prototyping`
   - or from a marketplace folder that lists this directory: `claude plugin marketplace add <path-to-marketplace>` then `claude plugin install lite-prototyping`.
4. Start Claude Code and run `/prototype a habit tracker with streaks`.

## Keeping the skill in one place

`skills/prototyping/SKILL.md` is the only source. The repo's own agent skill `.agents/skills/lite-prototyping/SKILL.md` is a generated copy: run `node scripts/sync-skill.mjs` after editing, and a unit test fails if the two differ. See [docs/plugin.md](../../docs/plugin.md).
