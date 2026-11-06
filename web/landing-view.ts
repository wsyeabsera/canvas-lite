// DOM wiring of the landing page (`#/`): the designer's gallery. Rules and shaping live in landing.ts (unit tested).
// Read-only: it only issues GET requests. Thumbnails are the start screen in an empty-sandbox srcdoc iframe (iframeSpec), never scripted,
// built lazily when a card scrolls into view and cached per canvas version.
import type { WatchRow } from "../cli/format.ts";
import { CANVAS_KINDS, describeCanvasDetail, iframeSpec, type CanvasDetail } from "./canvas.ts";
import {
  applyFilter, badgeOf, bannerModel, continueModel, describeEntries, FILTER_LABEL, FILTERS, filterCounts, foldSession, groupByProject, LAST_KEY, metaLine, parseLast,
  rememberRoute, rememberScreen, searchEntries, startScreenOf, thumbFit, type Entry, type Filter, type Last, type Sessions,
} from "./landing.ts";
import { hrefActivity, hrefCanvas, hrefPlay, hrefProject, hrefWalk, type ProjectInfo } from "./state.ts";

export type LandingDeps = {
  headers: () => Record<string, string>;
  projects: () => ProjectInfo[]; // every project Lite knows, in display order
  locked: () => void; // the API said 401/403
};

const $ = (id: string) => document.getElementById(id)!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const link = (href: string, cls: string, text: string, title?: string): HTMLAnchorElement => {
  const a = el("a", cls, text);
  a.href = href;
  if (title) a.title = title;
  return a;
};

const PLAY_ICON = "M7 4.5v15l13-7.5z";
function icon(d: string, size: number, fill = false): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  if (fill) s.setAttribute("fill", "currentColor");
  else for (const [k, v] of [["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "1.8"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]) s.setAttribute(k, v);
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}

export function createLandingView(deps: LandingDeps) {
  const root = $("view-landing");
  const bannerEl = $("ld-banner");
  const continueEl = $("ld-continue");
  const chipsEl = $("ld-chips");
  const galleryEl = $("ld-gallery");
  const searchEl = $("ld-search") as HTMLInputElement;
  const slot = $("ld-tools");

  let visible = false;
  let dirty = true;
  let settled = false; // false until the first websocket backfill has had time to arrive: no empty state before that
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loadSeq = 0;
  let entries: Entry[] = [];
  let query = "";
  let filter: Filter = "all";
  const collapsed = new Set<string>();
  let sessions: Sessions = {};
  let last: Last | null = null;
  try {
    last = parseLast(localStorage.getItem(LAST_KEY));
  } catch {
    /* storage blocked: nothing is remembered */
  }

  // --- thumbnails --------------------------------------------------------
  const details = new Map<string, Promise<CanvasDetail | null>>(); // by project/canvas/updated_at
  const known = new Map<string, CanvasDetail>(); // latest loaded detail per project/canvas (screen names for the Continue strip)

  function loadDetail(e: Entry): Promise<CanvasDetail | null> {
    const key = `${e.pid}/${e.id}/${e.updated_at}`;
    let p = details.get(key);
    if (!p) {
      p = fetch(`/api/projects/${e.pid}/canvases/${e.id}`, { headers: deps.headers() })
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) deps.locked();
          if (!res.ok) return null;
          return describeCanvasDetail(await res.json());
        })
        .catch(() => null);
      details.set(key, p);
      void p.then((d) => {
        if (d === null) details.delete(key); // retry on the next draw
        else known.set(`${e.pid}/${e.id}`, d);
      });
    }
    return p;
  }

  function mountThumb(box: HTMLElement, d: CanvasDetail | null) {
    const s = d ? startScreenOf(d.screens, d.canvas.start_screen) : null;
    if (!s) return box.classList.add("empty");
    const spec = iframeSpec(s);
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", spec.sandbox);
    f.referrerPolicy = spec.referrerpolicy;
    f.title = spec.title;
    f.tabIndex = -1;
    f.setAttribute("aria-hidden", "true");
    f.width = String(spec.width);
    f.height = String(spec.height);
    f.srcdoc = spec.srcdoc;
    const fit = () => {
      const r = thumbFit(spec.width, spec.height, box.clientWidth, box.clientHeight);
      f.style.transform = `scale(${r.scale})`;
      f.style.left = `${r.left}px`;
      f.style.top = `${r.top}px`;
    };
    box.replaceChildren(f);
    fit();
    box.classList.add("ready");
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(box);
  }

  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((items) => {
          for (const it of items) {
            if (!it.isIntersecting) continue;
            io!.unobserve(it.target);
            const box = it.target as HTMLElement;
            const e = (box as HTMLElement & { _entry?: Entry })._entry;
            if (e) void loadDetail(e).then((d) => mountThumb(box, d));
          }
        }, { rootMargin: "200px" })
      : null;

  function thumb(e: Entry, eager: boolean): HTMLElement {
    const box = el("div", "ld-thumb") as HTMLElement & { _entry?: Entry };
    box._entry = e;
    if (e.screens === 0) box.classList.add("empty");
    else if (eager || !io) void loadDetail(e).then((d) => mountThumb(box, d));
    else io.observe(box);
    return box;
  }

  // --- data ----------------------------------------------------------------
  async function load() {
    const mine = ++loadSeq;
    const projects = deps.projects();
    const lists = await Promise.all(
      projects.map(async (p) => {
        try {
          const res = await fetch(`/api/projects/${p.id}/canvases`, { headers: deps.headers() });
          if (res.status === 401 || res.status === 403) deps.locked();
          return res.ok ? describeEntries(p.id, p.name, await res.json()) : [];
        } catch {
          return [];
        }
      }),
    );
    if (mine !== loadSeq) return;
    entries = lists.flat();
    dirty = false;
    render();
  }

  function schedule(ms = 200) {
    dirty = true;
    if (!visible) return;
    clearTimeout(timer);
    timer = setTimeout(() => void load(), ms);
  }

  // --- drawing -------------------------------------------------------------
  const now = () => Date.now();

  function drawBanner() {
    const b = bannerModel(sessions, entries);
    bannerEl.hidden = !b;
    if (!b) return bannerEl.replaceChildren();
    bannerEl.replaceChildren(el("span", "ld-dot"), el("span", "ld-b-t", "Claude is presenting"), el("span", "ld-b-s", b.text), link(hrefPlay(b.pid, b.canvas), "ld-btn blue", "Watch live"));
  }

  const nameOf = (project: string, canvas: string) => (sid: string) => known.get(`${project}/${canvas}`)?.screens.find((s) => s.id === sid)?.name ?? null;

  function drawContinue() {
    const cm = last ? continueModel(last, entries, nameOf(last.project, last.canvas), now()) : null;
    continueEl.hidden = !cm;
    if (!cm || !last) return continueEl.replaceChildren();
    const e = cm.entry;
    const text = el("div", "ld-c-text");
    const sub = el("div", "ld-c-sub", cm.text);
    sub.id = "ld-c-sub";
    text.append(el("div", "ld-c-name", e.name), sub);
    const play = link(hrefPlay(e.pid, e.id, last.screen), "ld-btn blue", "", `Play ${e.name}${last.screen ? " from where you stopped" : ""}`);
    play.append(icon(PLAY_ICON, 12, true), document.createTextNode("Play"));
    const actions = el("div", "ld-c-actions");
    actions.append(play, link(hrefWalk(e.pid, e.id), "ld-btn outline", "Walkthrough"));
    const card = el("div", "ld-continue-card glass");
    card.append(thumb(e, true), text, actions);
    continueEl.replaceChildren(el("h2", undefined, "Continue"), card);
    // the screen's name arrives with the canvas detail
    void loadDetail(e).then(() => tickContinue());
  }

  function tickContinue() {
    const cm = last ? continueModel(last, entries, nameOf(last.project, last.canvas), now()) : null;
    const t = document.getElementById("ld-c-sub");
    if (cm && t) t.textContent = cm.text;
  }

  function drawChips(all: Entry[]) {
    const counts = filterCounts(all);
    chipsEl.replaceChildren(
      ...FILTERS.map((f) => {
        const b = el("button", "ld-chip", `${FILTER_LABEL[f]} ${counts[f]}`);
        b.type = "button";
        b.setAttribute("aria-pressed", String(f === filter));
        b.addEventListener("click", () => {
          filter = f;
          render();
        });
        return b;
      }),
    );
  }

  function card(e: Entry): HTMLElement {
    const c = el("article", "ld-card glass");
    const t = thumb(e, false);
    const scrim = el("div", "ld-scrim");
    const play = link(hrefPlay(e.pid, e.id), "ld-btn blue", "", `Play ${e.name}`);
    play.append(icon(PLAY_ICON, 12, true), document.createTextNode("Play"));
    scrim.append(play, link(hrefWalk(e.pid, e.id), "ld-btn glassy", "Walkthrough", `Walk through ${e.name}`));
    const wrap = el("div", "ld-thumbwrap");
    wrap.append(t, scrim);
    const b = badgeOf(e);
    const body = el("div", "ld-body");
    const name = link(hrefCanvas(e.pid, e.id), "ld-name", e.name); // its ::after covers the card: a click anywhere opens the canvas
    const meta = el("div", "ld-meta", metaLine(e, now()));
    meta.dataset.screens = String(e.screens);
    meta.dataset.ts = String(e.updated_at);
    const badge = el("span", `ld-badge ${b.kind}`, b.text);
    body.append(name, meta, badge);
    c.append(wrap, body);
    return c;
  }

  function drawGallery(all: Entry[]) {
    const shown = applyFilter(searchEntries(all, query), filter);
    if (all.length === 0) {
      galleryEl.replaceChildren(settled ? el("p", "ld-empty", "Nothing yet. Ask Claude to design something.") : el("p", "ld-empty"));
      return;
    }
    if (shown.length === 0) return galleryEl.replaceChildren(el("p", "ld-empty", "No designs match."));
    const frag = document.createDocumentFragment();
    for (const g of groupByProject(shown)) {
      const sec = el("section", "ld-group");
      const head = el("div", "ld-ghead");
      const toggle = el("button", "ld-gtoggle");
      toggle.type = "button";
      const open = !collapsed.has(g.pid);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.append(icon("M9 6l6 6-6 6", 14), el("span", "ld-gname", g.project), el("span", "ld-gcount", String(g.count)));
      const grid = el("div", "ld-grid");
      grid.hidden = !open;
      grid.append(...g.entries.map(card));
      toggle.addEventListener("click", () => {
        if (collapsed.has(g.pid)) collapsed.delete(g.pid);
        else collapsed.add(g.pid);
        grid.hidden = collapsed.has(g.pid);
        toggle.setAttribute("aria-expanded", String(!collapsed.has(g.pid)));
      });
      head.append(toggle, link(hrefProject(g.pid), "ld-details", "Details", `${g.project}: files and events`));
      sec.append(head, grid);
      frag.append(sec);
    }
    galleryEl.replaceChildren(frag);
  }

  function render() {
    if (!visible) return;
    drawBanner();
    drawContinue();
    drawChips(entries);
    drawGallery(entries);
  }

  // The gallery redraws on data and on filter/search changes; relative times tick in place so thumbnails never reload.
  setInterval(() => {
    if (!visible) return;
    for (const m of galleryEl.querySelectorAll<HTMLElement>(".ld-meta")) m.textContent = metaLine({ screens: Number(m.dataset.screens), updated_at: Number(m.dataset.ts) }, now());
    tickContinue();
  }, 30_000);

  searchEl.addEventListener("input", () => {
    query = searchEl.value;
    render();
  });
  searchEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && searchEl.value) {
      searchEl.value = "";
      query = "";
      render();
    }
  });

  const persist = () => {
    try {
      if (last) localStorage.setItem(LAST_KEY, JSON.stringify(last));
    } catch {
      /* ignore */
    }
  };

  return {
    /** The element the theme pill and docs link move into while the landing is on screen. */
    toolsSlot: slot,
    show() {
      visible = true;
      render();
      if (dirty || entries.length === 0) schedule(0);
    },
    hide() {
      visible = false;
      clearTimeout(timer);
    },
    /** Every websocket row: presenter sessions fold across projects; project and canvas changes refresh the gallery. */
    onRow(row: WatchRow) {
      const next = foldSession(sessions, row);
      if (next !== sessions) {
        sessions = next;
        if (visible) drawBanner();
      }
      if (row.kind === "project.opened" || row.kind === "project.removed" || CANVAS_KINDS.includes(row.kind)) schedule(row.kind.startsWith("project.") ? 150 : 400);
    },
    /** The first websocket connection is up: after the backfill settles, an empty gallery may say so. */
    connected() {
      if (settled) return;
      setTimeout(() => {
        settled = true;
        render();
      }, 700);
    },
    /** A route was opened: remember the canvas (and screen) for the Continue strip. */
    remember(route: { view: string; id?: string; canvas?: string; screen?: string | null }) {
      const next = rememberRoute(last, route, now());
      if (next !== last) {
        last = next;
        persist();
      }
    },
    /** Play moved to another screen. */
    rememberScreen(project: string, canvas: string, screen: string) {
      last = rememberScreen(project, canvas, screen, now());
      persist();
    },
    /** The top-bar Activity link target, so page.ts need not know the hash. */
    activityHref: hrefActivity,
  };
}
