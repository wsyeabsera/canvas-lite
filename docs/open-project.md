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
| `kind` | short label such as `web`, `cli`, `library`, 1 to 40 characters; default `project` |
| `repo` | optional URL of the remote repository |
| `manifest` | `{ "tree": string[], "files": { "<path>": "<text>" } }`: `tree` is relative paths (a trailing `/` marks a directory), `files` holds a few key files (README, package.json), each cut by the client to what matters |

## Tools

- `open_project { id?, name, kind?, repo?, manifest }` returns `{ project, seq }`: `project` is `{ id, name, kind, repo, opened_at, files }` (`files` = `tree` length), `seq` is the event it appended.
- `list_projects {}` returns `{ projects: [{ id, name, kind, repo, opened_at, files }] }`, newest `opened_at` first. No manifests.
- `read_project { id, include_manifest? }` returns `{ project, events }` (`events` = the project's latest 20, oldest first). With `include_manifest: true` (default false) it returns `{ project, manifest, events }`. An unknown id is the error `unknown project "<id>"`. The default is small on purpose: the manifest can be 65536 bytes.

## Building the manifest

One call is enough if the manifest is built like this (the `open_project` tool description says the same):

- `tree`: repo-relative paths, never absolute. Directories are entries ending in `/`. Collapse big directories (`node_modules/`, `dist/`, vendored or generated folders) to the single entry `dir/`.
- `files`: a few short excerpts, README first (about 1500 characters), then `package.json` or similar. Cut each on a line boundary, never mid-line.
- The whole manifest is at most 65536 bytes as JSON. If it is bigger the call fails with `manifest too large: <bytes> bytes, limit 65536` and stores nothing: trim the tree or the excerpts and call again.
- The returned `project.files` counts tree entries, not excerpts.

The tool description interpolates the limit from `MANIFEST_LIMIT` in `src/projects.ts`, so it cannot drift from the check.

- `remove_project { id }` archives the project and returns `{ project }` (with `archived_at` set), or the error `unknown project "<id>"`. In one transaction it sets `archived_at` and appends `project.removed`; the Hub broadcasts that event to watchers like `project.opened`. Removing an already archived project is a no-op: same summary, no second event.

Archived projects are hidden from `list_projects` and `GET /api/projects`. `read_project` still works on an archived id and its `project` shows `archived_at`. `open_project` with an archived id un-archives it (`archived_at` back to NULL). Nothing is ever deleted.

## Event

`open_project` appends `project.opened` with `project` set to the id:

```json
{ "name": "tvdash", "kind": "web", "repo": "https://github.com/yab/tvdash", "files": 42, "bytes": 3120 }
```

`remove_project` appends `project.removed` with payload `{ "name": "tvdash" }`. (The CLI and the watch page do not yet know this kind; another stage teaches them.)

The payload never carries the manifest; read it with `read_project` and `include_manifest: true`.

## Limits and errors

The manifest, as JSON text, is at most 65536 bytes. Nothing is stored when a check fails, and no event is written.

- `invalid project id "Bad_Id": use lowercase letters, digits and -, at most 40`
- `manifest too large: 90211 bytes, limit 65536`
- `invalid name: use 1 to 100 characters`, `invalid kind: use 1 to 40 characters`, `invalid repo: use text of at most 2000 characters`, `invalid manifest: expected { tree: string[], files: { path: text } }`

The limit counts UTF-8 bytes of the JSON `{ tree, files }`. MCP tool errors carry the message text.

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

The `projects` table from migration 1 has `path TEXT NOT NULL UNIQUE`, which does not fit a project that is told, not read. Migration 2 replaced `path` with `repo TEXT` (nullable) and added `manifest TEXT` (JSON, nullable); migration 3 adds `archived_at INTEGER` (nullable); `events` stays append-only, with its triggers untouched. Migration 1 is never edited. Update [Database](database.md) in the same commit.

## Non-goals

No file contents beyond the few key files the client chooses, no editing, no rendering.
