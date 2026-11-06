// The read-only watch page: the CLI's Watcher and formatter, drawn into views. It only reads; the one message it sends is the Watcher's hello.
import { clock, detail, type WatchRow } from "../cli/format.ts";
import { Watcher, normalizeUrl } from "../cli/watch-core.ts";
import { addRow, describeProject, initialState, MAX_ROWS, parseRoute, sortedProjects, visibleRows, type Route, type State } from "./state.ts";
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
    el("span", detail(row), "d"),
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
  const item = (href: string, label: string, count: number, kind: string | null, current: boolean) => {
    const li = el("li");
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
  for (const p of sortedProjects(state)) item(`#/project/${p.id}`, p.name, state.counts[p.id] ?? 0, p.kind, route.view === "project" && route.id === p.id);
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

function showRoute() {
  const wasProject = route.view === "project";
  route = parseRoute(location.hash);
  viewActivity.hidden = route.view !== "activity";
  viewProject.hidden = route.view !== "project";
  if (route.view === "project") {
    const p = state.projects[route.id];
    $("project-title").textContent = p?.name ?? route.id;
    setMeta(p?.kind ?? "", p?.repo ?? null, "");
    $("project-files").replaceChildren();
    projectRows = [];
    fill(projectEventsEl, mergedProjectRows());
    void loadProject(route.id);
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
    renderSidebar();
    if (route.view === "project" && row.project === route.id && row.kind === "project.opened" && !before) {
      $("project-title").textContent = state.projects[route.id]?.name ?? route.id;
    }
  },
  onStatus: (line) => {
    setStatus(line, line === "connected" ? "ok" : "wait");
    if (line === "connected") setLocked(false);
  },
  onRefused: () => {
    setStatus(token ? "refused: the token is wrong" : "refused: open this page with #token=<your token>", "bad");
    setLocked(true);
  },
});
showRoute();
watcher.start();
