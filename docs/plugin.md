---
sidebar_position: 11
slug: /plugin
---

# Claude Code plugin: lite-prototyping

Claude tends to produce half-finished prototypes: pictures with decorative nav, dead-end screens and no states. The plugin in `plugin/lite-prototyping/` makes the complete, product-wired result the default.

## What is in it

| Path | What |
|---|---|
| `.claude-plugin/plugin.json` | name `lite-prototyping`, version `0.1.0` |
| `skills/prototyping/SKILL.md` | the process skill (below) |
| `commands/prototype.md` | `/prototype <what to design>` runs the process |
| `.mcp.json` | template for the Lite MCP server: type `http`, url `https://<your-worker>/mcp`, header `Authorization: Bearer ${LITE_TOKEN}`. No token is stored |
| `README.md` | install steps |

## The process the skill enforces

1. Brief the product and write 2-4 user journeys as scenarios.
2. Inventory every screen including states (empty, loading, error, success, confirm) and the navigation model, before any html.
3. Write all screens in one `set_screens` pass with one shared nav; every control has `data-to`, `data-back` or a deliberate `data-inert`.
4. `set_flow` start screen.
5. `validate_flow`, then [`review_prototype`](prototype-tools.md), looping until `ok` and `score >= 90`.
6. `set_tour` per journey.
7. Only then `present`. A checklist and an anti-pattern list (placeholder screens, decorative nav, dead ends, one-screen flows) are in the skill. The `review_prototype` tool description says the same, so Claude sees the rule even without the plugin.

## Install

1. Edit `.mcp.json`: replace `https://<your-worker>/mcp` with your deployed Worker (local dev: `http://127.0.0.1:8790/mcp`).
2. `export LITE_TOKEN=<your token>` in your shell. Never commit a token.
3. Try it: `claude --plugin-dir ./plugin/lite-prototyping`, or add a marketplace folder that lists the directory and `claude plugin install lite-prototyping`.
4. Run `/prototype <what to design>`.

## One source, no drift

The skill lives in two places because Claude Code reads the plugin one and agents working in this repo read `.agents/skills/`. The plugin file `plugin/lite-prototyping/skills/prototyping/SKILL.md` is the only source. `.agents/skills/lite-prototyping/SKILL.md` is a generated copy: edit the plugin file, then run `node scripts/sync-skill.mjs` (`--check` compares only). `test/skill-sync.test.ts` fails when the copy differs, so `npm run check` catches drift.
