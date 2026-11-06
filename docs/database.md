---
sidebar_position: 3
slug: /database
---

# Database

One SQLite database: the Hub's Durable Object storage in production. `src/store.ts` holds the schema, migrations and
queries over a tiny `Sql` interface; `src/hub.ts` adapts Durable Object storage to it, and unit tests adapt `node:sqlite`
(`test/node-sql.ts`). Nothing else opens the database.

## Tables

| Table | Columns |
|---|---|
| `projects` | `id` (lowercase letters, digits, `-`, at most 40), `name`, `kind`, `repo` (nullable URL), `manifest` (nullable JSON text, at most 65536 bytes), `opened_at` (ms), `archived_at` (nullable ms; set by `remove_project`) |
| `canvases` | `project`, `id` (primary key together), `name`, `created_at`, `updated_at`, `archived_at` (nullable ms; set by `remove_canvas`) |
| `screens` | `project`, `canvas`, `id` (primary key together), `name`, `width`, `height`, `html`, `x`, `y` (nullable), `updated_at` |
| `events` | `seq` (autoincrement), `project` (nullable, references `projects`), `kind`, `payload` (JSON), `ts` (ms) |

## Event model

`events` is append-only: database triggers abort any `UPDATE` or `DELETE`. Progress is the log, read in `seq` order.

```ts
const e = appendEvent(sql, { project: "tvdash", kind: "project.opened", payload: { files: 42 } });
const missed = eventsAfter(sql, lastSeenSeq); // what a reconnecting watcher asks for
```

## Migrations

`MIGRATIONS` in `src/store.ts` is an ordered list; the `_migrations` table records which have run, each in its own
transaction, applied by the Hub's constructor before it serves anything. Append a new entry, never edit one that has
shipped. A database written by a newer build is refused.

Migration 2 replaces `projects.path` (NOT NULL UNIQUE) with nullable `repo` and adds `manifest`: the old rows are parked in
a scratch table, `projects` is dropped and recreated, and the rows are copied back with `repo` and `manifest` NULL, all in
the migration transaction. Durable Object SQL cannot change `foreign_keys`, so `PRAGMA defer_foreign_keys = ON` defers the
`events.project` check to commit. `events` and its append-only triggers are untouched.

Migration 3 is a plain `ALTER TABLE projects ADD COLUMN archived_at INTEGER` (nullable): no rebuild and no pragma, so rows,
events and triggers are untouched. A project is archived, never deleted, because events reference it and are append-only.

Migration 4 adds `canvases` and `screens` (see [Canvas and screens](canvas.md)). New tables only: rows, events and triggers are
untouched. `canvases` is keyed by `(project, id)` with `project` referencing `projects`; `screens` is keyed by
`(project, canvas, id)` and references `canvases`. Ids use the project slug rule and sizes are checked in SQL (width and height 100 to 8000,
names 1 to 100 characters). The html byte limit (200,000) is checked in `src/canvases.ts`, because SQLite `length()` counts characters.
A removed canvas keeps its row (`archived_at`) and its screens. Screens are listed in rowid order, which an upsert keeps.

Migration 5 adds the canvas flow to `canvases`: `start_screen` (nullable text, the id of a screen on that canvas) and
`transition` (NOT NULL, default `none`, checked in SQL to be one of `none`, `fade`, `slide-left`, `slide-right`, `push`).
Two plain `ADD COLUMN`s: no rebuild, rows, events and triggers are untouched, and existing canvases get no start screen and
`none`. `start_screen` has no foreign key: `setFlow` in `src/canvases.ts` checks the screen exists on the canvas, and
`removeScreen` clears it when that screen is removed. Links are not stored: they live in screen html as `data-to`,
`data-transition` and `data-back`, read by the pure `extractLinks(html)`; there is no link table.
