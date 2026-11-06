// The read-only watch page: the CLI's Watcher and formatter, drawn into views. It only reads; the one message it sends is the Watcher's hello.
import { clock, detail as eventDetail, type WatchRow } from "../cli/format.ts";
import { Watcher, normalizeUrl } from "../cli/watch-core.ts";
import { addRow, describeProject, hrefCanvas, hrefProject, hrefScreen, initialState, MAX_ROWS, parseRoute, routeProject, sortedProjects, visibleRows, type Route, type State } from "./state.ts";
import { agoText, canvasEvent, canvasMeta, describeCanvasDetail, describeCanvasList, dropCanvas, fitScale, focusSize, iframeSpec, mergeTiles, newestScreenId, prevNext, refetchPlan, screensLabel, type CanvasDetail, type CanvasSummary, type Pending, type Screen } from "./canvas.ts";
import { initTheme } from "./theme.ts";
import { tokenFromHash } from "./token.ts";

const KEY = "lite.token";
const $ = (id: string) => document.getElementById(id)!;
const app = $("app");
const locked = $("locked");
const status = $("status");
const projectsEl = $("projects");
const viewActivity = $("view-activity");
const viewProject = $("view-project");
const viewCanvas = $("view-canvas");
const eventsEl = $("events");
const projectEventsEl = $("project-events");

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
let route: Route = parseRoute(location.hash);

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

function renderSidebar() {
  const frag = document.createDocumentFragment();
  const item = (href: string, label: string, count: number, kind: string | null, current: boolean, sub = false) => {
    const li = el("li");
    if (sub) li.className = "sub";
    const a = el("a");
    a.href = href;
    a.append(label);
    if (kind) a.append(" ", el("span", kind));
    a.append(" ", el("span", String(count), "count"));
    if (current) a.setAttribute("aria-current", "page");
    li.append(a);
    frag.append(li);
  };
  item("#/", "All activity", state.total, null, route.view === "activity");
  const open = routeProject(route);
  for (const p of sortedProjects(state)) {
    item(hrefProject(p.id), p.name, state.counts[p.id] ?? 0, p.kind, route.view === "project" && route.id === p.id);
    if (p.id === open) for (const c of canvasLists[p.id] ?? []) item(hrefCanvas(p.id, c.id), c.name, c.screens, null, (route.view === "canvas" || route.view === "screen") && route.canvas === c.id, true);
  }
  projectsEl.replaceChildren(frag);
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
const cvHead = { crumb: $("cv-crumb"), meta: $("cv-meta"), live: $("cv-live"), body: $("cv-body") };
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
    renderSidebar();
    if (route.view === "project" && route.id === pid) renderCanvasCard();
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
  if ((route.view === "canvas" || route.view === "screen") && route.id === pid && route.canvas === cid) renderCanvasViews();
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
    if (w.detail && (route.view === "canvas" || route.view === "screen")) void loadDetail(pid, route.canvas);
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

// Thumbnails and the focused view scale an iframe of the screen's own size with a CSS transform.
const fits = new Map<Element, () => void>();
const ro = new ResizeObserver((entries) => {
  for (const e of entries) fits.get(e.target)?.();
});
const watchSize = (box: Element, fn: () => void) => {
  fits.set(box, fn);
  ro.observe(box);
  fn();
};
const forgetAll = () => {
  for (const box of fits.keys()) ro.unobserve(box);
  fits.clear();
};

function makeFrame(s: Screen): HTMLDivElement {
  const spec = iframeSpec(s);
  const wrap = el("div", undefined, "fwrap");
  wrap.style.width = `${spec.width}px`;
  wrap.style.height = `${spec.height}px`;
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", spec.sandbox); // empty: no scripts, forms or same-origin access
  f.setAttribute("referrerpolicy", spec.referrerpolicy);
  f.setAttribute("loading", spec.loading);
  f.title = spec.title;
  f.srcdoc = spec.srcdoc; // a property: the html is never parsed into this page
  f.tabIndex = -1;
  wrap.append(f);
  return wrap;
}

const dims = (s: { width: number; height: number }) => `${s.width} × ${s.height}`;
const tileCache = new Map<string, { sig: string; node: HTMLElement; thumb: HTMLElement; screen: Screen }>();

function fitThumb(thumb: HTMLElement, s: Screen) {
  const frame = thumb.firstElementChild as HTMLElement | null;
  if (!frame) return;
  const f = fitScale(thumb.clientWidth, thumb.clientHeight, s.width, s.height);
  frame.style.transform = `translate(${f.left}px, ${f.top}px) scale(${f.scale})`;
}

function captionOf(name: string, dim: string, extra?: string) {
  const cap = el("div", undefined, "cap");
  cap.append(el("span", name, "nm"));
  if (extra) cap.append(el("span", extra, "wr"));
  cap.append(el("span", dim, "dim"));
  return cap;
}

function makeTile(s: Screen, pid: string, cid: string) {
  const a = el("a", undefined, "tile");
  a.href = hrefScreen(pid, cid, s.id);
  a.setAttribute("aria-label", `${s.name}, ${s.width} by ${s.height}`);
  const thumb = el("div", undefined, "thumb");
  thumb.append(makeFrame(s));
  a.append(thumb, captionOf(s.name, dims(s)));
  return { node: a as HTMLElement, thumb };
}

function makeWriting(name: string, w: number, h: number): HTMLElement {
  const d = el("div", undefined, "tile writing");
  d.setAttribute("aria-live", "polite");
  d.setAttribute("aria-busy", "true");
  const thumb = el("div", undefined, "thumb");
  thumb.append(el("span", undefined, "bar1"), el("span", undefined, "bar2"), el("span", undefined, "bar3"), el("span", `Claude is writing ${name}…`, "wpill"));
  d.append(thumb, captionOf(name, dims({ width: w, height: h }), "writing"));
  return d;
}

function backLink(pid: string, cid: string) {
  const a = el("a", undefined, "pillbtn");
  a.href = hrefCanvas(pid, cid);
  a.append(svg("M15 6l-6 6 6 6"), "All screens");
  return a;
}

function stepLink(label: string, target: Screen | null, pid: string, cid: string, next: boolean) {
  const a = el("a", undefined, "pillbtn");
  if (!target) a.setAttribute("aria-disabled", "true");
  else {
    a.href = hrefScreen(pid, cid, target.id);
    a.setAttribute("aria-label", `${label}: ${target.name}`);
  }
  const text = target?.name ?? (next ? "Next" : "Previous");
  if (next) a.append(text, svg("M9 6l6 6-6 6"));
  else a.append(svg("M15 6l-6 6 6 6"), text);
  return a;
}

function renderCanvasViews() {
  if (route.view !== "canvas" && route.view !== "screen") return;
  const pid = route.id;
  const cid = route.canvas;
  const now = Date.now();
  const projName = state.projects[pid]?.name ?? pid;
  const listed = canvasLists[pid]?.find((c) => c.id === cid);
  const cname = detail?.canvas.name ?? listed?.name ?? cid;
  const sep = () => el("span", "/", "sep");
  const crumb: Node[] = [];
  const pl = el("a", projName);
  pl.href = hrefProject(pid);
  crumb.push(pl, sep());
  if (route.view === "screen") {
    const cl = el("a", cname);
    cl.href = hrefCanvas(pid, cid);
    crumb.push(cl, sep());
  }
  const nav = route.view === "screen" && detail ? prevNext(detail.screens, route.screen) : null;
  const last = el("h1", route.view === "screen" ? (nav?.screen.name ?? route.screen) : cname);
  last.setAttribute("aria-current", "page");
  crumb.push(last);
  cvHead.crumb.replaceChildren(...crumb);
  cvHead.meta.textContent = route.view === "canvas" && detail && detailState === "ok" ? canvasMeta(detail, now) : "";

  const body = cvHead.body;
  forgetAll();
  body.replaceChildren();
  const note = (text: string, withLink = true) => {
    const p = el("p", text, "note");
    if (withLink) {
      p.append(" ");
      const a = el("a", "Back to canvases");
      a.href = hrefProject(pid);
      p.append(a);
    }
    body.replaceChildren(p);
  };
  if (detailState === "missing") return note("This canvas does not exist or was removed.");
  if (!detail) return note(detailState === "error" ? "Could not load this canvas." : "Loading…", detailState === "error");

  if (route.view === "canvas") {
    const tiles = mergeTiles(detail.screens, pending);
    if (tiles.length === 0) {
      tileCache.clear();
      const box = el("div", undefined, "empty-cv");
      const ph = el("div", undefined, "ph");
      ph.setAttribute("aria-hidden", "true");
      ph.append(svg("M3 5h18v12H3zM8 21h8M12 17v4", 34));
      const t = el("div");
      t.setAttribute("aria-live", "polite");
      const p2 = el("p", undefined, "mu");
      p2.append("Screens appear here the moment Claude calls ", el("code", "set_screen"), ". No need to reload.");
      t.append(el("p", "Waiting for Claude to set the first screen", "t"), p2);
      box.append(ph, t);
      body.append(box);
      return;
    }
    const newest = newestScreenId(detail.screens);
    const grid = el("div", undefined, "grid");
    grid.setAttribute("aria-label", "Screens");
    const keep = new Set<string>();
    for (const t of tiles) {
      if (t.kind === "writing") {
        grid.append(makeWriting(t.name, t.width, t.height));
        continue;
      }
      const s = t.screen;
      const sig = `${s.updated_at}|${s.name}|${s.width}|${s.height}|${s.html.length}`;
      let c = tileCache.get(s.id);
      if (!c || c.sig !== sig) {
        const made = makeTile(s, pid, cid);
        c = { sig, node: made.node, thumb: made.thumb, screen: s };
        tileCache.set(s.id, c);
      }
      const { thumb, screen } = c;
      watchSize(thumb, () => fitThumb(thumb, screen));
      c.node.classList.toggle("newest", s.id === newest);
      keep.add(s.id);
      grid.append(c.node);
    }
    for (const id of [...tileCache.keys()]) if (!keep.has(id)) tileCache.delete(id);
    body.append(grid);
    return;
  }

  // focused screen
  tileCache.clear();
  if (!nav) {
    note("This screen does not exist or was removed.", false);
    body.append(backLink(pid, cid));
    return;
  }
  const s = nav.screen;
  const focus = el("div", undefined, "focus");
  const top = el("div", undefined, "top");
  top.append(backLink(pid, cid), el("span", `${nav.index} of ${nav.total}`, "k"));
  const fbox = el("div", undefined, "fbox");
  const tf = el("div", undefined, "thumbf");
  const frame = makeFrame(s);
  tf.append(frame);
  fbox.append(tf);
  watchSize(fbox, () => {
    const sz = focusSize(fbox.clientWidth, window.innerHeight * 0.65, s.width, s.height);
    tf.style.width = `${sz.width}px`;
    tf.style.height = `${sz.height}px`;
    frame.style.transform = `scale(${sz.scale})`;
  });
  const bot = el("div", undefined, "bot");
  const mid = el("div", undefined, "mid");
  const sub = el("span", undefined, "sub");
  sub.append(el("span", dims(s), "dim-inline"), ` · updated ${agoText(s.updated_at, now)} · sandboxed, no scripts`);
  mid.append(el("span", s.name, "nm"), sub);
  bot.append(stepLink("Previous screen", nav.prev, pid, cid, false), mid, stepLink("Next screen", nav.next, pid, cid, true));
  focus.append(top, fbox, bot);
  body.append(focus);
}

window.addEventListener("resize", () => {
  for (const fn of fits.values()) fn();
});
window.addEventListener("keydown", (e) => {
  if (route.view !== "screen" || !detail || e.altKey || e.ctrlKey || e.metaKey) return;
  const n = prevNext(detail.screens, route.screen);
  const t = e.key === "ArrowLeft" ? n?.prev : e.key === "ArrowRight" ? n?.next : null;
  if (t) location.hash = hrefScreen(route.id, route.canvas, t.id);
});
setInterval(() => {
  if (route.view === "project") renderCanvasCard();
  else if (route.view === "canvas" && detail && detailState === "ok") cvHead.meta.textContent = canvasMeta(detail, Date.now());
}, 30_000);

function showRoute() {
  const wasProject = route.view === "project";
  const prevProject = routeProject(route);
  const prevCanvas = route.view === "canvas" || route.view === "screen" ? route.canvas : null;
  route = parseRoute(location.hash);
  viewActivity.hidden = route.view !== "activity";
  viewProject.hidden = route.view !== "project";
  viewCanvas.hidden = route.view !== "canvas" && route.view !== "screen";
  const pid = routeProject(route);
  if (pid && pid !== prevProject) void loadList(pid);
  if (route.view === "canvas" || route.view === "screen") {
    if (route.canvas !== prevCanvas || pid !== prevProject) {
      detail = null;
      detailState = "loading";
      pending.clear();
      tileCache.clear();
      void loadDetail(route.id, route.canvas);
    }
    renderCanvasViews();
  } else {
    detailSeq++;
    detail = null;
    tileCache.clear();
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
  renderSidebar();
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
    append(eventsEl, row);
    if (route.view === "project" && row.project === route.id) {
      append(projectEventsEl, row);
      if (row.kind === "project.opened") void loadProject(route.id);
    }
    const ce = canvasEvent(row);
    if (ce && row.project) {
      if (ce.kind === "canvas.removed") canvasLists[row.project] = dropCanvas(canvasLists[row.project] ?? [], ce.canvas);
      const plan = refetchPlan(route, row);
      if (plan.detail && ce.kind === "screen.set" && ce.id) {
        pending.set(ce.id, { name: ce.name, width: ce.width, height: ce.height, at: ++eventCounter });
        renderCanvasViews();
      } else if (plan.detail) eventCounter++;
      if (plan.list || plan.detail) scheduleRefetch(plan);
    }
    renderSidebar();
    if (route.view === "project" && row.project === route.id && row.kind === "project.opened" && !before) {
      $("project-title").textContent = state.projects[route.id]?.name ?? route.id;
    }
  },
  onStatus: (line) => {
    setStatus(line, line === "connected" ? "ok" : "wait");
    cvHead.live.dataset.state = line === "connected" ? "on" : "off";
    cvHead.live.textContent = line === "connected" ? "live" : "reconnecting";
    if (line === "connected") setLocked(false);
  },
  onRefused: () => {
    setStatus(token ? "refused: the token is wrong" : "refused: open this page with #token=<your token>", "bad");
    setLocked(true);
  },
});
showRoute();
watcher.start();
