// The Hub: the one Durable Object that owns all Lite state. It is the only writer, so event order is insertion order.
import { DurableObject } from "cloudflare:workers";
import { appendEvent, migrate, type LiteEvent, type Sql } from "./store.ts";

export class Hub extends DurableObject<Env> {
  private sql: Sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const db = ctx.storage.sql;
    this.sql = {
      all: (q, ...p) => db.exec(q, ...(p as any[])).toArray() as any[],
      run: (q, ...p) => void db.exec(q, ...(p as any[])),
      script: (s) => void db.exec(s),
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    ctx.blockConcurrencyWhile(async () => migrate(this.sql));
  }

  ping(note?: string): LiteEvent {
    return appendEvent(this.sql, { kind: "ping", payload: note === undefined ? {} : { note } });
  }
}

export const hub = (env: Env) => env.HUB.getByName("default");
