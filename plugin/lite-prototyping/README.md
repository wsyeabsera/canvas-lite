# lite-prototyping (Claude Code plugin)

Makes Claude build complete, product-wired prototypes in [Lite](../../docs/index.md) instead of half-finished screens.

It contains:

- `skills/prototyping/SKILL.md`: the process skill (brief and journeys, screen and state inventory, one nav, one `set_screens` pass, `validate_flow` then `review_prototype` until ok and score 90+, tours, only then present).
- `commands/prototype.md`: `/prototype <what to design>` runs that process.
- `skills/scenes/SKILL.md`: the 3D process skill (brief and shot list, object inventory with lighting and sky, one `set_scene` pass then `set_films`, `validate_scene` then `review_scene` until ok and score 90+, only then show).
- `commands/scene.md`: `/scene <what to build>` runs that process.
- `.mcp.json`: a template for the Lite MCP server. It holds no token.

## Install

1. Deploy Lite (`npm run deploy`) and note your Worker URL. Edit `.mcp.json` and replace `https://<your-worker>/mcp` with it (local dev: `http://127.0.0.1:8790/mcp`).
2. Set the token in your shell, never in a file you commit: `export LITE_TOKEN=<your Lite token>`.
3. Add the plugin from this folder, either way:
   - try it without installing: `claude --plugin-dir ./plugin/lite-prototyping`
   - or from a marketplace folder that lists this directory: `claude plugin marketplace add <path-to-marketplace>` then `claude plugin install lite-prototyping`.
4. Start Claude Code and run `/prototype a habit tracker with streaks` or `/scene a small town at dusk`.

## Keeping the skill in one place

`skills/prototyping/SKILL.md` and `skills/scenes/SKILL.md` are the only sources. The repo's own agent skills `.agents/skills/lite-prototyping/SKILL.md` and `.agents/skills/lite-scenes/SKILL.md` are generated copies: run `node scripts/sync-skill.mjs` after editing, and a unit test fails if either differs. See [docs/plugin.md](../../docs/plugin.md).
