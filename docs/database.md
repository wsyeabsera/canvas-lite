---
sidebar_position: 3
slug: /database
---

# Database

One SQLite database. In production it is the Hub's Durable Object storage; `src/db.ts` holds the schema and migrations (being split into store logic and adapters in the move to the Durable Object).

## Tables

| Table | Columns |
|---|---|
| `projects` | `id` (lowercase letters, digits, `-`, at most 40), `name`, `path` (unique), `kind`, `opened_at` |
| `events` | `seq` (autoincrement), `project` (nullable, references `projects`), `kind`, `payload` (JSON), `ts` (ms) |

## Event model

`events` is append-only: database triggers abort any `UPDATE` or `DELETE`. Progress is the log, read in `seq` order.

```ts
const e = appendEvent(db, { project: "tvdash", kind: "project.opened", payload: { files: 42 } });
const missed = eventsAfter(db, lastSeenSeq); // what a reconnecting watcher asks for
```

## Migrations

`MIGRATIONS` in `src/db.ts` is an ordered list; `PRAGMA user_version` records how many have run, each in its own
transaction. Append a new entry, never edit one that has shipped. A database written by a newer build is refused.
