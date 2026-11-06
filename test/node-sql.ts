import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Sql } from "../src/store.ts";

/** The store's Sql interface on node:sqlite, for unit tests: plain Node, no workerd. */
export function nodeSql(file = ":memory:"): Sql & { close(): void } {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  return {
    all: (q, ...p) => db.prepare(q).all(...(p as SQLInputValue[])) as any[],
    run: (q, ...p) => void db.prepare(q).run(...(p as SQLInputValue[])),
    script: (s) => db.exec(s),
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => db.close(),
  };
}
