// The event store: pure logic over a tiny `Sql` interface. Production runs it on Durable Object storage
// (src/hub.ts); unit tests run it on node:sqlite (test/node-sql.ts). Nothing else opens the database.
export type Sql = {
  all<T = Record<string, unknown>>(query: string, ...params: unknown[]): T[];
  run(query: string, ...params: unknown[]): void;
  /** One or more statements, no parameters. */
  script(statements: string): void;
  transaction<T>(fn: () => T): T;
};

export type LiteEvent = { seq: number; project: string | null; kind: string; payload: unknown; ts: number };

// Append new migrations to the end. Never edit one that has shipped: `_migrations` records which ran.
export const MIGRATIONS = [
  `CREATE TABLE projects (
     id        TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*' AND length(id) <= 40),
     name      TEXT NOT NULL,
     path      TEXT NOT NULL UNIQUE,
     kind      TEXT NOT NULL,
     opened_at INTEGER NOT NULL
   );
   CREATE TABLE events (
     seq     INTEGER PRIMARY KEY AUTOINCREMENT,
     project TEXT REFERENCES projects(id),
     kind    TEXT NOT NULL,
     payload TEXT NOT NULL CHECK (json_valid(payload)),
     ts      INTEGER NOT NULL
   );
   CREATE TRIGGER events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;
   CREATE TRIGGER events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events are append-only'); END;`,
  // 2: a project is told, not read. `path` (NOT NULL UNIQUE) becomes nullable `repo`; add `manifest` (JSON text).
  // Table rebuild inside the migration transaction. Durable Object SQL forbids changing `foreign_keys`, so the
  // events -> projects reference is deferred to commit instead (resets on its own); events and triggers are not touched.
  // The rows are parked in a scratch table and inserted into the new `projects` after the drop, so the deferred
  // violation count returns to zero before commit.
  `PRAGMA defer_foreign_keys = ON;
   CREATE TABLE projects_v1 AS SELECT id, name, kind, opened_at FROM projects;
   DROP TABLE projects;
   CREATE TABLE projects (
     id        TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*' AND length(id) <= 40),
     name      TEXT NOT NULL,
     kind      TEXT NOT NULL,
     repo      TEXT,
     manifest  TEXT CHECK (manifest IS NULL OR json_valid(manifest)),
     opened_at INTEGER NOT NULL
   );
   INSERT INTO projects (id, name, kind, repo, manifest, opened_at) SELECT id, name, kind, NULL, NULL, opened_at FROM projects_v1;
   DROP TABLE projects_v1;`,
  // 3: remove_project archives instead of deleting (events are append-only and reference projects). Plain ADD COLUMN:
  // no rebuild, no pragma, rows, events and triggers are untouched.
  `ALTER TABLE projects ADD COLUMN archived_at INTEGER;`,
  // 4: canvases and screens (docs/canvas.md). New tables only: projects, events and triggers are untouched. Screen html
  // size (a byte limit; SQLite length() counts characters) is checked in src/canvases.ts. Screen order is rowid order,
  // which an upsert keeps.
  `CREATE TABLE canvases (
     project     TEXT NOT NULL REFERENCES projects(id),
     id          TEXT NOT NULL CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*' AND length(id) <= 40),
     name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
     created_at  INTEGER NOT NULL,
     updated_at  INTEGER NOT NULL,
     archived_at INTEGER,
     PRIMARY KEY (project, id)
   );
   CREATE TABLE screens (
     project    TEXT NOT NULL,
     canvas     TEXT NOT NULL,
     id         TEXT NOT NULL CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9-]*' AND length(id) <= 40),
     name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
     width      INTEGER NOT NULL CHECK (typeof(width) = 'integer' AND width BETWEEN 100 AND 8000),
     height     INTEGER NOT NULL CHECK (typeof(height) = 'integer' AND height BETWEEN 100 AND 8000),
     html       TEXT NOT NULL,
     x          INTEGER CHECK (x IS NULL OR typeof(x) = 'integer'),
     y          INTEGER CHECK (y IS NULL OR typeof(y) = 'integer'),
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (project, canvas, id),
     FOREIGN KEY (project, canvas) REFERENCES canvases(project, id)
   );`,
  // 5: the canvas flow (docs/canvas.md): a start screen id and a default transition. Plain ADD COLUMNs: no rebuild, rows,
  // events and triggers are untouched. `start_screen` has no foreign key: it is checked in src/canvases.ts and cleared
  // when that screen is removed. Existing canvases get no start screen and transition 'none'.
  `ALTER TABLE canvases ADD COLUMN start_screen TEXT;
   ALTER TABLE canvases ADD COLUMN transition TEXT NOT NULL DEFAULT 'none' CHECK (transition IN ('none', 'fade', 'slide-left', 'slide-right', 'push'));`,
  // 6: screen versions (docs/database.md), so a canvas can be replayed at any recorded event. New table + index only: rows,
  // events and triggers are untouched. One row per screen.set / screen.removed, keyed by the seq of that event and written
  // in the same transaction (src/timeline.ts). `removed` = 1 marks a removal (html is ''). Existing screens are backfilled
  // with their current html at the seq of their latest screen.set event (0 if none), so replay works from there on.
  `CREATE TABLE screen_versions (
     project TEXT NOT NULL,
     canvas  TEXT NOT NULL,
     screen  TEXT NOT NULL,
     seq     INTEGER NOT NULL,
     name    TEXT NOT NULL,
     width   INTEGER NOT NULL,
     height  INTEGER NOT NULL,
     html    TEXT NOT NULL,
     x       INTEGER,
     y       INTEGER,
     removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
     PRIMARY KEY (project, canvas, screen, seq),
     FOREIGN KEY (project, canvas) REFERENCES canvases(project, id)
   );
   CREATE INDEX screen_versions_canvas_seq ON screen_versions (project, canvas, seq);
   INSERT INTO screen_versions (project, canvas, screen, seq, name, width, height, html, x, y, removed)
     SELECT s.project, s.canvas, s.id,
            COALESCE((SELECT max(e.seq) FROM events e
                      WHERE e.project = s.project AND e.kind = 'screen.set'
                        AND json_extract(e.payload, '$.canvas') = s.canvas AND json_extract(e.payload, '$.id') = s.id), 0),
            s.name, s.width, s.height, s.html, s.x, s.y, 0
     FROM screens s ORDER BY s.rowid;`,
  // 7: 3D scenes (docs/scenes.md). New table only: rows, events and triggers are untouched. One row per scene holds the current
  // scene JSON in `data` and its films JSON in `films`; events never carry either (src/scene-store.ts is the only writer).
  `CREATE TABLE scenes (
     project    TEXT NOT NULL REFERENCES projects(id),
     id         TEXT NOT NULL,
     name       TEXT NOT NULL,
     data       TEXT NOT NULL,
     films      TEXT NOT NULL DEFAULT '[]',
     updated_at INTEGER NOT NULL,
     removed    INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
     PRIMARY KEY (project, id)
   );`,
  // 8: the page of a scene (docs/scenes.md "Page"): sections bound to shots, as JSON text ('null' = no page). Plain ADD COLUMN.
  `ALTER TABLE scenes ADD COLUMN page TEXT NOT NULL DEFAULT 'null';`,
  // 9: one design system per project (docs/design-system.md), JSON text; src/design-store.ts is the only writer. New table only.
  `CREATE TABLE design_systems (
     project    TEXT PRIMARY KEY REFERENCES projects(id),
     data       TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // 10: the sign-in throttle (docs/auth.md), one row per connection key; src/login-limit.ts is the only code that touches it.
  `CREATE TABLE login_attempts (
     key      TEXT PRIMARY KEY,
     count    INTEGER NOT NULL,
     first_at INTEGER NOT NULL
   );`,
];

/** Runs pending migrations, each in its own transaction. Refuses a database written by a newer build. */
export function migrate(sql: Sql): void {
  sql.script("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)");
  const done = sql.all<{ v: number | null }>("SELECT max(version) AS v FROM _migrations")[0]?.v ?? 0;
  if (done > MIGRATIONS.length) throw new Error(`database is version ${done}, this build knows ${MIGRATIONS.length}`);
  for (let v = done; v < MIGRATIONS.length; v++) {
    sql.transaction(() => {
      sql.script(MIGRATIONS[v]);
      sql.run("INSERT INTO _migrations (version) VALUES (?)", v + 1);
    });
  }
}

type Row = { seq: number; project: string | null; kind: string; payload: string; ts: number };
const toEvent = (r: Row): LiteEvent => ({ ...r, payload: JSON.parse(r.payload) });

export function appendEvent(sql: Sql, e: { project?: string | null; kind: string; payload?: unknown }, now = Date.now()): LiteEvent {
  const [r] = sql.all<Row>(
    "INSERT INTO events (project, kind, payload, ts) VALUES (?, ?, ?, ?) RETURNING seq, project, kind, payload, ts",
    e.project ?? null,
    e.kind,
    JSON.stringify(e.payload ?? {}),
    now,
  );
  return toEvent(r);
}

/** Events with seq greater than `after`, oldest first. */
export function eventsAfter(sql: Sql, after = 0, limit = 1000): LiteEvent[] {
  return sql.all<Row>("SELECT seq, project, kind, payload, ts FROM events WHERE seq > ? ORDER BY seq LIMIT ?", after, limit).map(toEvent);
}
