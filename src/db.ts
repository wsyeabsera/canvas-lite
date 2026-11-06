import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type LiteEvent = { seq: number; project: string | null; kind: string; payload: unknown; ts: number };

// Append new migrations to the end. Never edit one that has shipped: user_version records how many ran.
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

export function defaultDbFile(env = process.env): string {
  return join(env.LITE_HOME ?? join(homedir(), ".lite"), "lite.db");
}

/** Opens (creating if needed) the database and runs pending migrations, each in its own transaction. */
export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version > MIGRATIONS.length) throw new Error(`database is version ${version}, this build knows ${MIGRATIONS.length}`);
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

type Row = { seq: number; project: string | null; kind: string; payload: string; ts: number };
const toEvent = (r: Row): LiveEvent => ({ ...r, payload: JSON.parse(r.payload) });

export function appendEvent(db: DatabaseSync, e: { project?: string | null; kind: string; payload?: unknown }, now = Date.now()): LiveEvent {
  const r = db
    .prepare("INSERT INTO events (project, kind, payload, ts) VALUES (?, ?, ?, ?) RETURNING seq, project, kind, payload, ts")
    .get(e.project ?? null, e.kind, JSON.stringify(e.payload ?? {}), now) as Row;
  return toEvent(r);
}

/** Events with seq greater than `after`, oldest first. */
export function eventsAfter(db: DatabaseSync, after = 0, limit = 1000): LiveEvent[] {
  const rows = db.prepare("SELECT seq, project, kind, payload, ts FROM events WHERE seq > ? ORDER BY seq LIMIT ?").all(after, limit) as Row[];
  return rows.map(toEvent);
}

if (import.meta.main) {
  const file = process.argv[2] ?? defaultDbFile();
  openDb(file).close();
  console.log(`database ready: ${file}`);
}
