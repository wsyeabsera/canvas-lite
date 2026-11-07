// The read-only watch page: the CLI's Watcher and formatter, drawn into views. It only reads; the one message it sends is the Watcher's hello.
import { clock, detail as eventDetail, type WatchRow } from "../cli/format.ts";
import { Watcher, normalizeUrl } from "../cli/watch-core.ts";
import { addRow, describeProject, hrefCanvas, hrefLanding, hrefPlay, hrefScene, hrefSceneWatch, hrefWalk, hrefWatch, hrefScreen, initialState, MAX_ROWS, parseRoute, routeCanvas, routeProject, sceneEventHits, sortedProjects, visibleRows, type Route, type State } from "./state.ts";
import { agoText, canvasEvent, describeCanvasDetail, describeCanvasList, dropCanvas, refetchPlan, screensLabel, type CanvasDetail, type CanvasSummary, type Pending } from "./canvas.ts";
import { createCanvasView } from "./canvas-view.ts";
import { createPlayView } from "./play-view.ts";
import { createWalkView } from "./walk-view.ts";
import { createWatchView } from "./watch-view.ts";
import { createReplayView } from "./replay-view.ts";
import { createLiveView } from "./live-view.ts";
import { createLandingView } from "./landing-view.ts";
import { initialFollow, onCanvasLoad, onPresenterEvent, pillModel, resumeFollow, takeOver, tourCaption, tourLabel, tourPause, tourResume, tourStart, tourTick, type FollowState, type Target, type TourRun } from "./follow.ts";
import { initTheme } from "./theme.ts";
import { hasWebGPU, parseTheme, shouldRun, shouldShow, themeColors } from "./backdrop.ts";
import { tokenFromHash } from "./token.ts";

const KEY = "lite.token";
const $ = (id: string) => document.getElementById(id)!;
const app = $("app");
const locked = $("locked");
const status = $("status");
const viewActivity = $("view-activity");
const viewLanding = $("view-landing");
const viewProject = $("view-project");
const viewCanvas = $("view-canvas");
const viewScene = $("view-scene");
const viewScenePage = $("view-scene-page");
const eventsEl = $("events");
const projectEventsEl = $("project-events");
const topBar = $("top-bar");
const barTools = $("bar-tools"); // docs link and theme button: in the top bar, or the canvas's top-right island
const cvTools = $("cv-tools");

let token = tokenFromHash(location.hash);
try {
  if (token) {
    localStorage.setItem(KEY, token);
    history.replaceState(null, "", location.pathname); // the token leaves the address bar
  } else token = localStorage.getItem(KEY) ?? undefined;
} catch {
  /* storage can be blocked: the token then lives only in this tab's fragment */
}

let state: State = initialState();
let route: Route = { view: "activity" }; // showRoute() reads the hash, so a first load counts as a route change

const setStatus = (text: string, s: "ok" | "wait" | "bad") => {
  status.textContent = text;
  status.dataset.state = s;
};
const setLocked = (on: boolean) => {
  locked.hidden = !on;
  app.hidden = on;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function makeRow(row: WatchRow): HTMLLIElement {
  const li = el("li");
  li.append(
    el("span", clock(row.ts), "t"),
    el("span", `#${row.seq}`, "n"),
    el("span", row.kind, row.kind === "project.opened" ? "k open" : "k"),
    el("span", row.project ?? "-", "p"),
    el("span", eventDetail(row), "d"),
  );
  return li;
}

/** Appends one row to a list, marks it new, trims to MAX_ROWS, keeps the view pinned to the end when it was. */
function append(list: HTMLElement, row: WatchRow) {
  const scroller = list; // the <ul> itself scrolls (public/index.html)
  const atEnd = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
  list.querySelector("li.new")?.classList.remove("new");
  const li = makeRow(row);
  li.classList.add("new");
  list.append(li);
  while (list.childElementCount > MAX_ROWS) list.firstElementChild!.remove();
  if (atEnd) scroller.scrollTop = scroller.scrollHeight;
}

function fill(list: HTMLElement, rows: WatchRow[]) {
  const frag = document.createDocumentFragment();
  for (const r of rows.slice(-MAX_ROWS)) frag.append(makeRow(r));
  list.replaceChildren(frag);
  list.scrollTop = list.scrollHeight;
  list.lastElementChild?.classList.add("new");
}

// --- project view -------------------------------------------------------
let projectRows: WatchRow[] = []; // rows from the API for the open project
let fetchSeq = 0;

const mergedProjectRows = () => {
  if (route.view !== "project") return [];
  const bySeq = new Map<number, WatchRow>();
  for (const r of projectRows) bySeq.set(r.seq, r);
  for (const r of visibleRows(state, route)) bySeq.set(r.seq, r);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
};

function setMeta(kind: string, repo: string | null, description: string, message?: string) {
  const meta = $("project-meta");
  const parts: Node[] = [];
  if (message) parts.push(el("span", message));
  else {
    if (kind) parts.push(el("span", kind, "chip"));
    if (repo) {
      const a = el("a", repo);
      a.href = repo;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      parts.push(a);
    }
    if (description) parts.push(el("span", description, "desc"));
  }
  meta.replaceChildren(...parts);
}

async function loadProject(id: string) {
  const mine = ++fetchSeq;
  try {
    const res = await fetch(`/api/projects/${id}`, { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (mine !== fetchSeq) return;
    if (res.status === 401 || res.status === 403) return setLocked(true);
    if (res.status === 404) return setMeta("", null, "", "Not told to Lite yet");
    if (!res.ok) return setMeta("", null, "", `Could not load (${res.status})`);
    const v = describeProject(await res.json());
    if (mine !== fetchSeq || route.view !== "project" || route.id !== id) return;
    $("project-title").textContent = v.title;
    setMeta(v.kind, v.repo, v.description);
    $("project-files").replaceChildren(...v.files.map((f) => el("li", f)));
    projectRows = v.rows;
    fill(projectEventsEl, mergedProjectRows());
  } catch {
    if (mine === fetchSeq) setMeta("", null, "", "Could not load");
  }
}

// --- canvases ----------------------------------------------------------
const canvasLists: Record<string, CanvasSummary[]> = {};
let detail: CanvasDetail | null = null;
let detailState: "loading" | "ok" | "missing" | "error" = "loading";
const pending = new Map<string, Pending>(); // screens Claude is writing right now (shown as a placeholder)
let eventCounter = 0;
let listSeq = 0;
let detailSeq = 0;
let refetchTimer: ReturnType<typeof setTimeout> | undefined;
let want = { list: false, detail: false };
const cvLive = $("cv-live");
const headers = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

async function loadList(pid: string) {
  const mine = ++listSeq;
  try {
    const res = await fetch(`/api/projects/${pid}/canvases`, { headers: headers() });
    if (mine !== listSeq) return;
    if (res.status === 401 || res.status === 403) return setLocked(true);
    if (!res.ok) return;
    const list = describeCanvasList(await res.json());
    if (mine !== listSeq) return;
    canvasLists[pid] = list;
    if (route.view === "project" && route.id === pid) renderCanvasCard();
    renderCanvas();
  } catch {
    /* keep what we have */
  }
}

async function loadDetail(pid: string, cid: string) {
  const mine = ++detailSeq;
  const startedAt = eventCounter;
  try {
    const res = await fetch(`/api/projects/${pid}/canvases/${cid}`, { headers: headers() });
    if (mine !== detailSeq) return;
    if (res.status === 401 || res.status === 403) return setLocked(true);
    if (res.status === 404) detailState = "missing";
    else if (!res.ok) detailState = "error";
    else {
      const d = describeCanvasDetail(await res.json());
      if (mine !== detailSeq) return;
      detail = d;
      detailState = d ? "ok" : "error";
    }
  } catch {
    if (mine !== detailSeq) return;
    detailState = "error";
  }
  for (const [id, p] of pending) if (p.at <= startedAt) pending.delete(id); // their html has arrived (or will not)
  if (offerPending && detailState === "ok" && detail && routeCanvas(route) === cid && routeProject(route) === pid) {
    offerPending = false; // the stored session is offered once per canvas load, never on a refetch
    const r = onCanvasLoad(fs, detail.presenter, cid);
    fs = r.state;
    if (r.jump && (route.view === "canvas" || (route.view === "play" && route.screen === null))) followJump(pid, r.jump);
  }
  if (routeCanvas(route) === cid && routeProject(route) === pid) renderCanvas();
}

function scheduleRefetch(plan: { list: boolean; detail: boolean }) {
  want = { list: want.list || plan.list, detail: want.detail || plan.detail };
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    const w = want;
    want = { list: false, detail: false };
    const pid = routeProject(route);
    if (!pid) return;
    if (w.list) void loadList(pid);
    const open = routeCanvas(route);
    if (w.detail && open) void loadDetail(pid, open);
  }, 150);
}

const svg = (d: string, size = 15) => {
  const ns = "http://www.w3.org/2000/svg";
  const e = document.createElementNS(ns, "svg");
  e.setAttribute("viewBox", "0 0 24 24");
  e.setAttribute("width", String(size));
  e.setAttribute("height", String(size));
  e.setAttribute("fill", "none");
  e.setAttribute("stroke", "currentColor");
  e.setAttribute("stroke-width", "1.8");
  e.setAttribute("stroke-linecap", "round");
  e.setAttribute("stroke-linejoin", "round");
  e.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  e.append(path);
  return e;
};

function renderCanvasCard() {
  if (route.view !== "project") return;
  const pid = route.id;
  const list = canvasLists[pid] ?? [];
  const now = Date.now();
  $("canvases-h").textContent = list.length ? `Canvases · ${list.length}` : "Canvases";
  $("canvas-empty").hidden = list.length > 0 || canvasLists[pid] === undefined;
  $("canvas-list").replaceChildren(
    ...list.map((c) => {
      const li = el("li");
      const a = el("a");
      a.href = hrefCanvas(pid, c.id);
      const chev = svg("M9 6l6 6-6 6", 16);
      chev.classList.add("chev");
      a.append(el("span", undefined, "ico"), el("span", c.name, "nm"), el("span", screensLabel(c.screens), "mu"), el("span", `updated ${agoText(c.updated_at, now)}`, "mu"), chev);
      li.append(a);
      return li;
    }),
  );
}

const canvasView = createCanvasView(
  (id) => {
    if (route.view !== "canvas" && route.view !== "screen") return;
    location.hash = id ? hrefScreen(route.id, route.canvas, id) : hrefCanvas(route.id, route.canvas);
  },
  () => {
    if (route.view === "canvas" || route.view === "screen") location.hash = hrefPlay(route.id, route.canvas, route.view === "screen" ? route.screen : null);
  },
  () => {
    if (route.view === "canvas" || route.view === "screen") location.hash = hrefWalk(route.id, route.canvas);
  },
  () => {
    if (route.view === "canvas" || route.view === "screen") location.hash = hrefWatch(route.id, route.canvas);
  },
);

// Live play: Claude's presenter session and the tour (rules in web/follow.ts, DOM in web/live-view.ts).
const loadedAt = Date.now(); // presenter events older than this are websocket backfill, not live
let fs: FollowState = initialFollow();
let tour: TourRun | null = null;
let tourTimer: ReturnType<typeof setInterval> | undefined;
let tourLast = 0;
let offerPending = false; // set when a canvas starts loading; the first answer may offer the stored session
let held: Target | null = null; // a goto for a screen the page does not have yet, retried after the next refetch

function followJump(pid: string, t: Target) {
  if ((route.view === "play" || route.view === "walk") && route.id === pid && route.canvas === t.canvas && playView.isOpen()) {
    const r = playView.goto(t.screen, t.transition);
    held = r === "missing" || r === "closed" ? t : null;
  } else {
    held = null;
    location.hash = hrefPlay(pid, t.canvas, t.screen);
  }
}

function stopTour() {
  clearInterval(tourTimer);
  tour = null;
}

function drawLive() {
  if (route.view !== "play" && route.view !== "walk") return;
  const steps = detail?.tour ?? [];
  const pill = pillModel(fs, route.canvas, detail?.screens ?? [], steps);
  liveView.draw({ pill, follow: pill?.kind === "taken", tour: route.view === "play" && steps.length > 0 && pill?.kind !== "live" ? tourLabel(tour) : null, caption: tourCaption(tour) });
}

function runTour(dt: number) {
  if (!tour) return;
  const x = tourTick(tour, dt);
  tour = x.run;
  if (x.enter && playView.goto(x.enter.step.screen, null) === "closed") return stopTour();
  if (!tour.playing) clearInterval(tourTimer);
  drawLive();
}

function toggleTour() {
  const steps = detail?.tour ?? [];
  if (steps.length === 0 || !playView.isOpen()) return;
  if (tour?.playing) {
    tour = tourPause(tour);
    clearInterval(tourTimer);
  } else {
    tour = tour ? tourResume(tour) : tourStart(steps);
    clearInterval(tourTimer);
    tourLast = Date.now();
    tourTimer = setInterval(() => {
      const n = Date.now();
      const dt = n - tourLast;
      tourLast = n;
      runTour(dt);
    }, 100);
    runTour(0);
  }
  drawLive();
}

/** The viewer moved by hand: Follow turns off (Claude's session goes on) and a running tour pauses. */
function viewerTookOver() {
  fs = takeOver(fs);
  if (tour?.playing) {
    tour = tourPause(tour);
    clearInterval(tourTimer);
  }
  drawLive();
}

const liveView = createLiveView({
  takeOver: viewerTookOver,
  follow: () => {
    const r = resumeFollow(fs);
    fs = r.state;
    const pid = routeProject(route);
    if (r.jump && pid) followJump(pid, r.jump);
    drawLive();
  },
  tour: toggleTour,
});

// Present mode (web/play-view.ts) sits over the canvas view; Esc / Exit goes back to where Play was pressed.
let playReturn: string | null = null;
const playView = createPlayView({
  userAction: viewerTookOver,
  exit: () => {
    if (route.view === "play" || route.view === "walk") location.hash = playReturn ?? hrefCanvas(route.id, route.canvas);
  },
  moved: (screen) => {
    if (route.view === "walk") return walkView.moved(screen); // the walkthrough keeps its own route
    // keep the address linkable without a history entry per click (replaceState fires no hashchange)
    if (route.view === "play") {
      history.replaceState(null, "", hrefPlay(route.id, route.canvas, screen));
      landing.rememberScreen(route.id, route.canvas, screen);
    }
  },
});

// Walkthrough mode of play (web/walk.ts rules, web/walk-view.ts DOM): the step rail over the same play view.
const walkView = createWalkView({
  goto: (screen) => playView.goto(screen, null),
  links: () => playView.links(),
  setInset: (px) => playView.setInset(px),
  exit: () => {
    if (route.view === "walk") location.hash = playReturn ?? hrefCanvas(route.id, route.canvas);
  },
  userAction: viewerTookOver,
});

const replay = createReplayView(headers);
$("cv-replay").addEventListener("click", () => {
  if (route.view === "canvas" || route.view === "screen") void replay.open(route.id, route.canvas);
});

// Scenario video player (web/watch.ts rules, web/watch-view.ts DOM): `#/project/<id>/canvas/<cid>/watch[/<scenarioId>]`.
const watchView = createWatchView({
  exit: () => {
    if (route.view === "watch") location.hash = playReturn ?? hrefCanvas(route.id, route.canvas);
  },
  picker: () => {
    if (route.view === "watch") location.hash = hrefWatch(route.id, route.canvas);
  },
  pick: (sid) => {
    if (route.view === "watch") location.hash = hrefWatch(route.id, route.canvas, sid);
  },
  tryIt: (screen) => {
    if (route.view === "watch") location.hash = hrefPlay(route.id, route.canvas, screen);
  },
  moved: (sid) => {
    if (route.view !== "watch") return;
    route = { ...route, scenario: sid };
    history.replaceState(null, "", hrefWatch(route.id, route.canvas, sid)); // linkable without a history entry per scenario
  },
});

function renderCanvas() {
  if (route.view === "activity" || route.view === "landing" || route.view === "project" || route.view === "scene" || route.view === "scene-page" || route.view === "scene-watch") return;
  const pid = route.id;
  const cid = route.canvas;
  canvasView.render({
    pid,
    projectName: state.projects[pid]?.name ?? pid,
    canvasName: detail?.canvas.name ?? canvasLists[pid]?.find((c) => c.id === cid)?.name ?? cid,
    detail,
    state: detailState,
    pending,
    selected: route.view === "screen" ? route.screen : null,
  });
  if (route.view === "watch") watchView.render({ detail, state: detailState });
  if (route.view === "play" || route.view === "walk") {
    if (tour && JSON.stringify(tour.steps) !== JSON.stringify(detail?.tour ?? [])) stopTour(); // Claude set a new tour
    if (route.view === "walk") walkView.render(detail);
    playView.render({ detail, state: detailState }, route.view === "walk" ? walkView.first() : route.screen);
    if (held && playView.goto(held.screen, held.transition) !== "missing") held = null;
    drawLive();
  }
}

setInterval(() => {
  if (route.view === "project") renderCanvasCard();
}, 30_000);

// The landing page (web/landing-view.ts): `#/`, the gallery. Declared before the play view because `moved` remembers the screen.
const landing = createLandingView({ headers, projects: () => sortedProjects(state), locked: () => setLocked(true) });

// A 3D scene in Orbit mode (web/scene-view.ts, imported lazily; it imports Three.js lazily in turn): `#/project/<id>/scene/<sid>`.
let sceneScreen: import("./scene-view.ts").SceneScreen | null = null;
let sceneLoad: Promise<unknown> | null = null;
// The two modes share #view-scene, each in its own host: Orbit (web/scene-view.ts) and Watch (web/scene-watch-view.ts).
const sceneOrbitHost = document.createElement("div");
sceneOrbitHost.className = "sc-host";
const sceneWatchHost = document.createElement("div");
sceneWatchHost.className = "sc-host";
sceneWatchHost.hidden = true;
viewScene.append(sceneOrbitHost, sceneWatchHost);
function openScene(pid: string, sid: string) {
  sceneLoad ??= import("./scene-view.ts").then((m) => {
    sceneScreen = m.createSceneScreen(sceneOrbitHost, { headers, exit: () => (location.hash = hrefLanding), locked: () => setLocked(true) });
  });
  sceneLoad.then(() => {
    if (route.view === "scene" && route.id === pid && route.scene === sid) sceneScreen?.open(pid, sid);
  }).catch(() => {
    sceneLoad = null; // a failed chunk load is retried on the next visit
  });
}

// A scene's Page mode (web/scene-page-view.ts, imported lazily): `#/project/<id>/scene/<sid>/page`. Exit and Esc go back to Orbit.
let scenePage: import("./scene-page-view.ts").ScenePageScreen | null = null;
let scenePageLoad: Promise<unknown> | null = null;
function openScenePage(pid: string, sid: string) {
  scenePageLoad ??= import("./scene-page-view.ts").then((m) => {
    scenePage = m.createScenePageScreen(viewScenePage, { headers, exit: (p, s) => (location.hash = hrefScene(p, s)), locked: () => setLocked(true) });
  });
  scenePageLoad.then(() => {
    if (route.view === "scene-page" && route.id === pid && route.scene === sid) scenePage?.open(pid, sid);
  }).catch(() => {
    scenePageLoad = null;
  });
}

// Watch mode of a 3D scene: `#/project/<id>/scene/<sid>/watch[/<filmId>]` (the film picker and player, loaded lazily).
let sceneWatch: import("./scene-watch-view.ts").SceneWatchScreen | null = null;
let sceneWatchLoad: Promise<unknown> | null = null;
function openSceneWatch(pid: string, sid: string, film: string | null) {
  sceneWatchLoad ??= import("./scene-watch-view.ts").then((m) => {
    sceneWatch = m.createSceneWatchScreen(sceneWatchHost, {
      headers,
      locked: () => setLocked(true),
      exit: () => (location.hash = hrefLanding),
      orbit: () => { if (route.view === "scene-watch") location.hash = hrefScene(route.id, route.scene); },
      picker: () => { if (route.view === "scene-watch") location.hash = hrefSceneWatch(route.id, route.scene); },
      pick: (f) => { if (route.view === "scene-watch") location.hash = hrefSceneWatch(route.id, route.scene, f); },
      moved: (f) => {
        if (route.view !== "scene-watch" || route.film === f) return;
        route = { ...route, film: f };
        history.replaceState(null, "", hrefSceneWatch(route.id, route.scene, f)); // linkable without a history entry per film
      },
    });
  });
  sceneWatchLoad.then(() => {
    if (route.view === "scene-watch" && route.id === pid && route.scene === sid) sceneWatch?.open(pid, sid, film);
  }).catch(() => {
    sceneWatchLoad = null;
  });
}

function showRoute() {
  const wasProject = route.view === "project";
  const prevProject = routeProject(route);
  const prevCanvas = routeCanvas(route);
  const prev = route;
  route = parseRoute(location.hash);
  landing.remember(route);
  viewLanding.hidden = route.view !== "landing";
  app.classList.toggle("landing-mode", route.view === "landing");
  if (route.view === "landing") landing.show();
  else landing.hide();
  viewActivity.hidden = route.view !== "activity";
  viewProject.hidden = route.view !== "project";
  const inCanvas = routeCanvas(route) !== null;
  const inScene = route.view === "scene" || route.view === "scene-page" || route.view === "scene-watch";
  viewCanvas.hidden = !inCanvas;
  viewScene.hidden = route.view !== "scene" && route.view !== "scene-watch"; // Orbit and Watch share it; Page mode has its own section
  viewScenePage.hidden = route.view !== "scene-page";
  if (route.view === "scene-page") openScenePage(route.id, route.scene);
  else scenePage?.close();
  app.classList.toggle("canvas-mode", inCanvas || inScene); // hides the top bar, sidebar and main panel (and pauses the backdrop)
  if (!inCanvas && !inScene) startBackdrop(); // never started (no GPU cost) while only the canvas or a scene has been shown
  sceneOrbitHost.hidden = route.view !== "scene";
  sceneWatchHost.hidden = route.view !== "scene-watch";
  if (route.view === "scene") openScene(route.id, route.scene);
  else sceneScreen?.close();
  if (route.view === "scene-watch") openSceneWatch(route.id, route.scene, route.film);
  else sceneWatch?.close();
  (inCanvas ? cvTools : route.view === "landing" ? landing.toolsSlot : topBar).append(barTools);
  const pid = routeProject(route);
  if (pid && pid !== prevProject) {
    void loadList(pid);
    fs = initialFollow(); // the session belongs to a project
  }
  const wasPlaying = prev.view === "play" || prev.view === "walk" || prev.view === "watch";
  if (route.view === "canvas" || route.view === "screen" || route.view === "play" || route.view === "walk" || route.view === "watch") {
    const same = route.canvas === prevCanvas && pid === prevProject;
    if (!same) {
      replay.close();
      detail = null;
      detailState = "loading";
      pending.clear();
      stopTour();
      held = null;
      offerPending = true;
      void loadDetail(route.id, route.canvas);
    }
    if (route.view === "watch") {
      if ((prev.view === "canvas" || prev.view === "screen") && same) playReturn = prev.view === "screen" ? hrefScreen(prev.id, prev.canvas, prev.screen) : hrefCanvas(prev.id, prev.canvas);
      else if (!wasPlaying || !same) playReturn = null;
      if (!wasPlaying || !same) canvasView.enter(same);
      canvasView.pause();
      stopTour();
      walkView.close();
      playView.close();
      renderCanvas();
      watchView.open({ detail, state: detailState }, route.scenario);
    } else if (route.view === "play" || route.view === "walk") {
      watchView.close();
      if ((prev.view === "canvas" || prev.view === "screen") && same) playReturn = prev.view === "screen" ? hrefScreen(prev.id, prev.canvas, prev.screen) : hrefCanvas(prev.id, prev.canvas);
      else if (!wasPlaying || !same) playReturn = null;
      if (!wasPlaying || !same) canvasView.enter(same);
      canvasView.pause(); // the canvas keeps its view under play
      renderCanvas();
      const at = route.view === "walk" ? walkView.open(detail) : (walkView.close(), route.screen);
      playView.open({ detail, state: detailState }, at);
    } else {
      stopTour();
      walkView.close();
      playView.close();
      watchView.close();
      if (wasPlaying && same) canvasView.resume();
      else canvasView.enter(same);
      renderCanvas();
    }
  } else {
    detailSeq++;
    detail = null;
    pending.clear();
    stopTour();
    offerPending = false;
    walkView.close();
    playView.close();
    watchView.close();
    canvasView.leave();
    replay.close();
  }
  if (route.view === "project") {
    const p = state.projects[route.id];
    $("project-title").textContent = p?.name ?? route.id;
    setMeta(p?.kind ?? "", p?.repo ?? null, "");
    $("project-files").replaceChildren();
    projectRows = [];
    fill(projectEventsEl, mergedProjectRows());
    void loadProject(route.id);
    renderCanvasCard();
  } else if (wasProject) {
    fetchSeq++;
  }
}

// --- backdrop -----------------------------------------------------------
// The WebGPU backdrop (web/backdrop-view.ts) loads on the first non-canvas route, and only when WebGPU exists; it then
// follows canvas mode, the theme and tab visibility itself. Any failure keeps the CSS gradient (never throws).
let backdropStarted = false;
function startBackdrop() {
  if (backdropStarted || !hasWebGPU(navigator)) return;
  backdropStarted = true;
  import("./backdrop-view.ts").then((m) => m.startBackdrop($("backdrop"), app, { parseTheme, shouldRun, shouldShow, themeColors })).catch(() => {});
}

// --- wiring -------------------------------------------------------------
initTheme($("theme-toggle"));
window.addEventListener("hashchange", showRoute);

const watcher = new Watcher({
  url: normalizeUrl(location.origin),
  token,
  WebSocket: WebSocket as any,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as number),
  onRow: (row) => {
    const next = addRow(state, row);
    if (next === state) return;
    const before = state.projects[row.project ?? ""];
    state = next;
    landing.onRow(row);
    append(eventsEl, row);
    if (route.view === "project" && row.project === route.id) {
      append(projectEventsEl, row);
      if (row.kind === "project.opened") void loadProject(route.id);
    }
    if (sceneEventHits(route, row)) {
      if (route.view === "scene-page") scenePage?.refetch();
      else if (route.view === "scene-watch") sceneWatch?.refetch();
      else sceneScreen?.refetch();
    }
    const ce = canvasEvent(row);
    if (ce && row.project) {
      if (ce.kind === "canvas.removed") canvasLists[row.project] = dropCanvas(canvasLists[row.project] ?? [], ce.canvas);
      const plan = refetchPlan(route, row);
      if (plan.detail && ce.kind === "screen.set" && ce.id) {
        pending.set(ce.id, { name: ce.name, width: ce.width, height: ce.height, at: ++eventCounter });
        canvasView.markRecent(ce.id);
        renderCanvas();
      } else if (plan.detail) eventCounter++;
      if (plan.list || plan.detail) scheduleRefetch(plan);
    }
    if (row.project && row.kind.startsWith("presenter.") && row.project === routeProject(route)) {
      const r = onPresenterEvent(fs, row, loadedAt);
      fs = r.state;
      if (r.jump) followJump(row.project, r.jump);
      drawLive();
    }
    if (row.kind === "project.opened" && !before) renderCanvas(); // the island shows the project's name once Lite knows it
    if (route.view === "project" && row.project === route.id && row.kind === "project.opened" && !before) {
      $("project-title").textContent = state.projects[route.id]?.name ?? route.id;
    }
  },
  onStatus: (line) => {
    setStatus(line, line === "connected" ? "ok" : "wait");
    cvLive.dataset.state = line === "connected" ? "on" : "off";
    cvLive.textContent = line === "connected" ? "live" : "reconnecting";
    if (line === "connected") {
      setLocked(false);
      landing.connected();
    }
  },
  onRefused: () => {
    setStatus(token ? "refused: the token is wrong" : "refused: open this page with #token=<your token>", "bad");
    setLocked(true);
  },
});
showRoute();
watcher.start();
