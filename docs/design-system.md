---
sidebar_position: 12
slug: /design-system
---

# Design system (one per project)

Every project can hold one **design system**: the colors, fonts, type sizes, spacing and corner radii its screens use, plus a few written rules. Claude reads it before designing, so the next screen looks like the last one. `review_prototype` flags a screen that drifts from it. The watch page shows it at `#/project/<id>/design`.

It is **data first**. The rules are prose, but the tokens are values Lite can check. A design system that is only prose cannot be checked, which is the failure this feature exists to stop.

## Model

```json
{
  "name": "tvdash",
  "colors":  { "bg": "#0a0c13", "text": "#f3f5fa", "accent": "#7aa2ff" },
  "fonts":   { "body": "Inter, system-ui, sans-serif", "mono": "ui-monospace, Menlo, monospace" },
  "sizes":   { "caption": 12, "body": 14, "title": 34 },
  "space":   { "sm": 8, "md": 16, "lg": 24 },
  "radius":  { "card": 16, "pill": 999 },
  "rules": "Glass cards on a dark gradient. One accent color. Never more than two font sizes on a card."
}
```

- Token names are slugs (lowercase letters, digits, `-`, at most 40). Each group holds at most 64 tokens.
- `colors` are `#rrggbb` (three-digit `#rgb` is accepted and stored as six digits, lowercase). `fonts` are CSS font-family stacks (at most 200 characters, no `;`, `{` or `}`). `sizes`, `space` and `radius` are whole pixel numbers from 0 to 999.
- `rules` is Markdown text, at most 8000 characters; `name` at most 80. Everything but the groups is optional; a missing group is empty.
- The whole document is at most 50000 bytes. It is checked before anything is stored, and an error names the path of the bad value.

## DESIGN.md

`renderDesignMd(system)` turns the document into one Markdown file, the same text everywhere: a heading, the `rules`, then a table per group (`Token | Value`). The watch page, `get_design_system` and any export show this one text. It is built from the data, never stored, so the two cannot disagree.

## Store

One row per project in `design_systems(project PRIMARY KEY, data TEXT, updated_at)`, written only by `src/design-store.ts` (a pure module over `Sql`, like `src/scene-store.ts`). A write stores the row and appends a `design.set` event `{bytes}` in one transaction; the event never carries the document. There is no version history in this version: the event log says when it changed.

## MCP tools

| Tool | Does |
|---|---|
| `get_design_system(project)` | `{design: {tokens, markdown, updated_at} \| null}`. Read it before designing a screen or a scene. |
| `set_design_system(project, data)` | Replace the whole document. |
| `patch_design_system(project, edits)` | Edits `[{group, name, value}]` or `[{group, name, remove: true}]` (1 to 50), applied in order to one group token; `group: "rules"` or `"name"` takes `value` as text. The result is checked as a whole. |

`set_screens`, `set_screen`, `set_scene` and the prototyping guide say: if the project has a design system, read it first and use its tokens.

## Drift checks

`review_prototype` adds warnings when the project has a design system, never when it has none. They look only at the screen's own CSS and inline styles (`src/design-drift.ts`, pure):

| Kind | Fires when | Fix says |
|---|---|---|
| `off_token_color` | a color literal (`#hex`, `rgb()`, `rgba()`) is not a token color. Alpha is ignored: `rgba(10, 12, 19, .5)` is compared as `#0a0c13`. | use the nearest token color, or add it with `patch_design_system` |
| `off_token_font` | the first family of a `font-family` is not the first family of any token font | use a token font |
| `off_token_size` | a `font-size` in `px` is not a token size | use a token size |

Each kind is reported once per screen with up to five offending values. Spacing and radius are **not** checked: pixel values in layout are too noisy to flag.

## Watch page

`GET /api/projects/<id>/design` answers `{design}` (null when none). The route `#/project/<id>/design` shows the tokens as swatches, a type scale, spacing and radius samples and the rules, with a link to a plain DESIGN.md view; the project heading on the landing has a **Design system** link to it. The page is read-only and updates live on `design.set`.

## Not in this version

A visual token editor, version history and diff, import from Figma or CSS, checks for spacing and radius, themes (light and dark sets).
