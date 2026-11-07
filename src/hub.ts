// The Hub: the one Durable Object that owns all Lite state. It is the only writer, so event order is insertion order.
// It also holds the read-only /events WebSockets (Hibernation API: an idle watcher costs nothing).
import { DurableObject } from "cloudflare:workers";
import { tokenOk } from "./auth.ts";
import { SESSION_HEADER } from "./session.ts";
import { parseHello, replay } from "./events.ts";
import { createCanvas, listCanvases, listCanvasesForPage, readCanvas, removeCanvas, removeScreen, setFlow, setScreen, setScreens, type ScreenFields, type ScreenInput } from "./canvases.ts";
import { canvasAt, canvasTimeline } from "./timeline.ts";
import { patchScreen, readCanvasForPage, readFlow, reviewFlow, setTour, validateFlow, type PatchEdit } from "./flow.ts";
import { setScenarios } from "./scenarios.ts";
import { adminOverview, archiveEmptyProject } from "./admin.ts";
import { checkLogin, clearFailures, recordFailure } from "./login-limit.ts";
import { forkCanvas, listVariants, mergeVariant } from "./variants.ts";
import { startTournament, startTournamentWalk, tournamentResults } from "./tournament.ts";
import { readWalk, startWalk, stepWalk } from "./walks.ts";
import { extractLinks } from "./canvases.ts";
import { getDesignSystem, patchDesignSystem, setDesignSystem } from "./design-store.ts";
import { createScene, listScenes, patchScene, readScene, reviewStoredScene, setFilms, setPage, setScene, validateStoredScene, type SceneEdit } from "./scene-store.ts";
import { goto, present, stopPresent } from "./present.ts";
import { listProjects, openProject, readProject, removeProject, type OpenInput, type ProjectSummary } from "./projects.ts";
import { appendEvent,migrate, type LiteEvent, type Sql } from "./store.ts";

type Attachment = { authed: boolean; session: boolean }; // session: the Worker saw a valid page session cookie on the upgrade

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

  removeProject(id: string): { project: ProjectSummary } {
    const { project, event } = removeProject(this.sql, id);
    if (event) this.broadcast(event);
    return { project };
  }

  listProjects() {
    return listProjects(this.sql);
  }

  readProject(id: string, includeManifest = false) {
    return readProject(this.sql, id, includeManifest);
  }

  createCanvas(project: string, input: { name: string; id?: string }) {
    const { event, ...result } = createCanvas(this.sql, project, input);
    if (event) this.broadcast(event);
    return result;
  }

  listCanvases(project: string) {
    return listCanvases(this.sql, project);
  }

  listCanvasesForPage(project: string) {
    return listCanvasesForPage(this.sql, project);
  }

  readCanvas(project: string, canvas: string, includeHtml = false) {
    return readCanvas(this.sql, project, canvas, includeHtml);
  }

  canvasTimeline(project: string, canvas: string) {
    return canvasTimeline(this.sql, project, canvas);
  }

  canvasAt(project: string, canvas: string, seq: number) {
    return canvasAt(this.sql, project, canvas, seq);
  }

  setScreen(project: string, input: ScreenInput) {
    const { event, ...result } = setScreen(this.sql, project, input);
    this.broadcast(event);
    return result;
  }

  setScreens(project: string, canvas: string, screens: ScreenFields[]) {
    const { events, ...result } = setScreens(this.sql, project, canvas, screens);
    for (const e of events) this.broadcast(e);
    return result;
  }

  removeScreen(project: string, canvas: string, id: string) {
    const { event, ...result } = removeScreen(this.sql, project, canvas, id);
    if (event) this.broadcast(event);
    return result;
  }

  setFlow(project: string, canvas: string, input: { start_screen?: string | null; transition?: string }) {
    const { event, ...result } = setFlow(this.sql, project, canvas, input);
    if (event) this.broadcast(event);
    return result;
  }

  readFlow(project: string, canvas: string) {
    return readFlow(this.sql, project, canvas);
  }

  validateFlow(project: string, canvas: string) {
    return validateFlow(this.sql, project, canvas);
  }

  reviewPrototype(project: string, canvas: string) {
    return reviewFlow(this.sql, project, canvas);
  }

  /** The canvas as the watch page loads it: html, plus its tour, scenarios and the project's presenter session. */
  readCanvasForPage(project: string, canvas: string) {
    return readCanvasForPage(this.sql, project, canvas);
  }

  patchScreen(project: string, canvas: string, id: string, edits: PatchEdit[]) {
    const { event, ...result } = patchScreen(this.sql, project, canvas, id, edits);
    this.broadcast(event);
    return result;
  }

  setTour(project: string, canvas: string, steps: unknown) {
    const { event, ...result } = setTour(this.sql, project, canvas, steps);
    this.broadcast(event);
    return result;
  }

  setScenarios(project: string, canvas: string, scenarios: unknown) {
    const { event, ...result } = setScenarios(this.sql, project, canvas, scenarios);
    this.broadcast(event);
    return result;
  }

  createScene(project: string, input: { name: string; id?: string }) {
    const { event, ...result } = createScene(this.sql, project, input);
    this.broadcast(event);
    return result;
  }

  setScene(project: string, scene: string, data: unknown) {
    const { event, ...result } = setScene(this.sql, project, scene, data);
    this.broadcast(event);
    return result;
  }

  patchScene(project: string, scene: string, edits: SceneEdit[]) {
    const { event, ...result } = patchScene(this.sql, project, scene, edits);
    this.broadcast(event);
    return result;
  }

  setFilms(project: string, scene: string, films: unknown) {
    const { event, result } = setFilms(this.sql, project, scene, films);
    this.broadcast(event);
    return result;
  }

  setPage(project: string, scene: string, page: unknown) {
    const { event, result } = setPage(this.sql, project, scene, page);
    this.broadcast(event);
    return result;
  }

  readScene(project: string, scene: string) {
    return readScene(this.sql, project, scene);
  }

  listScenes(project: string) {
    return { scenes: listScenes(this.sql, project) };
  }

  private broadcastAll(events: LiteEvent[]) {
    for (const e of events) this.broadcast(e);
  }

  forkCanvas(project: string, input: { canvas: string; name: string; id?: string; seq?: number }) {
    const { events, ...result } = forkCanvas(this.sql, project, input);
    this.broadcastAll(events);
    return result;
  }

  listVariants(project: string, canvas: string) {
    return listVariants(this.sql, project, canvas);
  }

  mergeVariant(project: string, variant: string) {
    const { events, ...result } = mergeVariant(this.sql, project, variant);
    this.broadcastAll(events);
    return result;
  }

  startTournament(project: string, input: { canvas: string; goals: unknown; runs?: number; canvases?: string[] }) {
    const { event, ...result } = startTournament(this.sql, project, input);
    this.broadcast(event);
    return result;
  }

  tournamentResults(project: string, tournament: string) {
    return tournamentResults(this.sql, project, tournament);
  }

  startWalk(project: string, input: { canvas?: string; goal?: string; target?: string; tournament?: string; goal_index?: number }) {
    const run = input.tournament !== undefined
      ? startTournamentWalk(this.sql, project, { tournament: input.tournament, canvas: String(input.canvas), goal_index: Number(input.goal_index) })
      : startWalk(this.sql, project, { canvas: String(input.canvas), goal: String(input.goal ?? ""), target: String(input.target ?? "") });
    const { events, ...result } = run;
    this.broadcastAll(events);
    return result;
  }

  stepWalk(project: string, walk: string, input: { choice?: number; give_up?: boolean; note?: string }) {
    const { events, ...result } = stepWalk(this.sql, project, walk, input);
    this.broadcastAll(events);
    return result;
  }

  readWalk(project: string, walk: string) {
    return readWalk(this.sql, project, walk);
  }

  /** A walk plus the link graph of its canvas, for the trace drawing on the watch page. */
  readWalkForPage(project: string, walk: string) {
    const w = readWalk(this.sql, project, walk);
    const screens = this.sql.all<{ id: string; name: string; html: string }>("SELECT id, name, html FROM screens WHERE project = ? AND canvas = ? ORDER BY rowid", project, w.canvas);
    return { ...w, screens: screens.map((s) => ({ id: s.id, name: s.name, links: [...new Set(extractLinks(s.html).map((l) => l.to))] })) };
  }

  getDesignSystem(project: string) {
    return getDesignSystem(this.sql, project);
  }

  setDesignSystem(project: string, data: unknown) {
    const { event, ...result } = setDesignSystem(this.sql, project, data);
    this.broadcast(event);
    return result;
  }

  patchDesignSystem(project: string, edits: unknown) {
    const { event, ...result } = patchDesignSystem(this.sql, project, edits);
    this.broadcast(event);
    return result;
  }

  validateScene(project: string, scene: string) {
    return validateStoredScene(this.sql, project, scene);
  }

  reviewScene(project: string, scene: string) {
    return reviewStoredScene(this.sql, project, scene);
  }

  present(project: string, input: { canvas: string; screen?: string }) {
    const { event, ...result } = present(this.sql, project, input);
    this.broadcast(event);
    return result;
  }

  goto(project: string, input: { screen: string; transition?: string }) {
    const { event, ...result } = goto(this.sql, project, input);
    this.broadcast(event);
    return result;
  }

  stopPresent(project: string) {
    const { event, ...result } = stopPresent(this.sql, project);
    if (event) this.broadcast(event);
    return result;
  }

  removeCanvas(project: string, canvas: string) {
    const { event, ...result } = removeCanvas(this.sql, project, canvas);
    if (event) this.broadcast(event);
    return result;
  }

  /** Sign-in throttle (src/login-limit.ts): may this connection try, count a wrong password, forget failures after a right one. */
  loginCheck(key: string) {
    return checkLogin(this.sql, key);
  }

  loginFailed(key: string) {
    return recordFailure(this.sql, key);
  }

  loginOk(key: string) {
    clearFailures(this.sql, key);
  }

  adminOverview() {
    return adminOverview(this.sql);
  }

  archiveProject(id: string) {
    const { event } = archiveEmptyProject(this.sql, id);
    if (event) this.broadcast(event);
    return { archived: id };
  }

  ping(note?: string): LiteEvent {
    return this.record({ kind: "ping", payload: note === undefined ? {} : { note } });
  }

  /** A watcher connects here and must authenticate with its first message (docs/progress.md). */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected a websocket", { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authed: false, session: request.headers.get(SESSION_HEADER) === "1" } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Watchers are read-only: after the hello, any message at all ends the connection.
    if ((ws.deserializeAttachment() as Attachment | null)?.authed) return void ws.close(1008, "read-only");
    const hello = parseHello(message);
    const session = (ws.deserializeAttachment() as Attachment | null)?.session === true;
    if (!hello || !(session || tokenOk(hello.token, this.env.LITE_TOKEN))) return void ws.close(1008, "refused");
    ws.serializeAttachment({ authed: true, session } satisfies Attachment);
    for (const event of replay(this.sql, hello.after)) ws.send(JSON.stringify(event));
  }
}

export const hub = (env: Env) => env.HUB.getByName("default");
