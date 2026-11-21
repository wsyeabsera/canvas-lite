---
sidebar_position: 34
slug: /improvements
---

# Improvements to what Claude produces

Five changes to the prototyping loop, each drawn as what it adds or removes. All are built except the larger tool merge, which was decided against (see section 3). The same diagrams are on the `improvements` canvas of the `lite-app` project.

## 1. Claude sees its own screen (`screen_image`)

Review is structural: `review_prototype` scores links, dead ends and states. A screen can score 90 and still overflow or have unreadable contrast, because nothing looks at pixels.

```
Claude ─ screen_image(canvas, screen) ─▶ Hub ─ appends shot.requested ─▶ watch page (open)
                                          ▲                                  │ renders the screen to a PNG
                                          └──── POST /api/projects/<id>/shots/<request> ◀─┘
Claude ◀─ image + {screen, width, height} ─┘      (15 s wait; no page open: an error that says so)
```

Claude then fixes what it sees with `patch_screen` and asks again. See [Prototype tools](prototype-tools.md).

## 2. `present` enforces the review

```
Before: present ─▶ shows
After:  present ─▶ recompute the review now ─▶ ok and score >= 90 ?
                                                  yes ─▶ shows
                                                  no  ─▶ isError: scores 62, the first three fixes (force: true to override)
```

The review is recomputed, not looked up, so an edit after the last review is always caught.

## 3. Fewer tools: `set_screen` folded into `set_screens`

```
set_screen  ┐
            ├─▶ set_screens (1 to 20 screens, the whole field guide in one description)
set_screens ┘
```

`read_*` and `list_*` were not merged: a `read(kind)` tool would drop each tool's typed schema and its description, which Claude relies on, to save a few lines each. The measurable cost was the duplicated field guide in two long descriptions, and that is gone.

## 4. Errors say how to fix it

`validate_flow` issues now carry a `fix` (as `review_prototype` issues already did), for every kind. `test/fix-hints.test.ts` fails if a kind has none.

```
Before: { kind: "dead_end", message: "\"b\" has no links out and no back control" }
After:  { kind: "dead_end", message: ..., fix: "add a data-back control or a data-to link to another screen (patch_screen)" }
```

## 5. `lite init` notices stale skills

```
lite init ─▶ copies skills ─▶ writes .claude/lite-skills.json {hash}
lite init --check ─▶ compares with this checkout ─▶ "skills are out of date: run lite init" (exit 1)
Claude: ping ─▶ skills_hash (what the Worker was deployed with) ── differs from the project's file ─▶ tell the user
```

## Not changed

No stack change. TypeScript, Node 24, Workers with a Durable Object, and the MCP SDK stay. No framework for `web/`, no phone layouts, no e2e tests (see CLAUDE.md).
