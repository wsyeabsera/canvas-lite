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
const MIGRATIONS = [
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
