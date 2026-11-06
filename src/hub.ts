// The Hub: the one Durable Object that owns all Lite state. It is the only writer, so event order is insertion order.
// It also holds the read-only /events WebSockets (Hibernation API: an idle watcher costs nothing).
import { DurableObject } from "cloudflare:workers";
import { tokenOk } from "./auth.ts";
import { parseHello, replay } from "./events.ts";
import { listProjects, openProject, readProject, type OpenInput, type ProjectSummary } from "./projects.ts";
import { appendEvent,migrate, type LiteEvent, type Sql } from "./store.ts";

type Attachment = { authed: boolean };

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

  /** The single write path: append, then push to every authenticated watcher. */
  private record(e: { project?: string | null; kind: string; payload?: unknown }): LiteEvent {
    return this.broadcast(appendEvent(this.sql, e));
  }

  /** Push an already committed event to every authenticated watcher. */
  private broadcast(event: LiteEvent): LiteEvent {
    const line = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.authed) ws.send(line);
    }
    return event;
  }

  openProject(input: OpenInput): { project: ProjectSummary; seq: number } {
    const { event, ...result } = openProject(this.sql, input);
    this.broadcast(event);
    return result;
  }

  listProjects() {
    return listProjects(this.sql);
  }

  readProject(id: string) {
    return readProject(this.sql, id);
  }

  ping(note?: string): LiteEvent {
    return this.record({ kind: "ping", payload: note === undefined ? {} : { note } });
  }

  /** A watcher connects here and must authenticate with its first message (docs/progress.md). */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authed: false } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Watchers are read-only: after the hello, any message at all ends the connection.
    if ((ws.deserializeAttachment() as Attachment | null)?.authed) return void ws.close(1008, "read-only");
    const hello = parseHello(message);
    if (!hello || !tokenOk(hello.token, this.env.LITE_TOKEN)) return void ws.close(1008, "refused");
    ws.serializeAttachment({ authed: true } satisfies Attachment);
    for (const event of replay(this.sql, hello.after)) ws.send(JSON.stringify(event));
  }
}

export const hub = (env: Env) => env.HUB.getByName("default");
