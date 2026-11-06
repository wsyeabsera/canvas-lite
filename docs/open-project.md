---
sidebar_position: 4
slug: /open-project
---

# Open a project

The Worker cannot read your disk, so a project is told, not read: Claude reads the local checkout and calls
`open_project` with a summary (the manifest). Lite stores the summary and appends an event. See [Architecture](ARCHITECTURE.md).

## A project

| Field | Rule |
|---|---|
| `id` | slug: lowercase letters, digits, `-`, at most 40 (same check as `src/store.ts`); optional on input, default is the slugified `name` |
| `name` | non-empty text, at most 100 characters |
| `kind` | short label such as `web`, `cli`, `library`; default `project` |
| `repo` | optional URL of the remote repository |
| `manifest` | `{ "tree": string[], "files": { "<path>": "<text>" } }`: `tree` is relative paths (a trailing `/` marks a directory), `files` holds a few key files (README, package.json), each cut by the client to what matters |

## Tools

- `open_project { id?, name, kind?, repo?, manifest }` returns `{ project, seq }`: `project` is `{ id, name, kind, repo, opened_at, files }` (`files` = `tree` length), `seq` is the event it appended.
- `list_projects {}` returns `{ projects: [{ id, name, kind, repo, opened_at, files }] }`, newest `opened_at` first. No manifests.
- `read_project { id }` returns `{ project, manifest }`, or the error `unknown project "<id>"`.

## Event

`open_project` appends `project.opened` with `project` set to the id:

```json
{ "name": "tvdash", "kind": "web", "repo": "https://github.com/yab/tvdash", "files": 42, "bytes": 3120 }
```

The payload never carries the manifest; read it with `read_project`.

## Limits and errors

The manifest, as JSON text, is at most 65536 bytes. Nothing is stored when a check fails, and no event is written.

- `invalid project id "Bad_Id": use lowercase letters, digits and -, at most 40`
- `manifest too large: 90211 bytes, limit 65536`

## Idempotent

Calling `open_project` twice with the same `id` leaves one `projects` row (name, kind, repo, manifest and `opened_at` are replaced) and appends two `project.opened` events. The row and its event are written in one transaction.

## Example: tvdash

```json
{ "name": "tvdash", "kind": "web", "repo": "https://github.com/yab/tvdash",
  "manifest": { "tree": ["hub/", "hub/src/", "hub/src/index.ts", "package.json"],
                "files": { "package.json": "{ \"name\": \"tvdash\" }" } } }
```

Returns `{ "project": { "id": "tvdash", "name": "tvdash", "kind": "web", "repo": "https://github.com/yab/tvdash", "opened_at": 1762400000000, "files": 4 }, "seq": 7 }`.

## Schema change

The `projects` table from migration 1 has `path TEXT NOT NULL UNIQUE`, which does not fit a project that is told, not read. Migration 2 must replace `path` with `repo TEXT` (nullable) and add `manifest TEXT` (JSON, nullable); `events` stays append-only, with its triggers untouched. Migration 1 is never edited. Update [Database](database.md) in the same commit.

## Non-goals

No file contents beyond the few key files the client chooses, no editing, no rendering.
