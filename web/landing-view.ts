// DOM wiring of the landing page (`#/`): the designer's gallery. Rules and shaping live in landing.ts (unit tested).
// Read-only: it only issues GET requests. Thumbnails are the start screen in an empty-sandbox srcdoc iframe (iframeSpec), never scripted,
// built lazily when a card scrolls into view and cached per canvas version.
import type { WatchRow } from "../cli/format.ts";
import { CANVAS_KINDS, describeCanvasDetail, iframeSpec, type CanvasDetail } from "./canvas.ts";
import {
  applyFilter, badgeOf, bannerModel, continueModel, describeEntries, FILTER_LABEL, FILTERS, filterCounts, filterByProject, foldSession, LAST_KEY, metaLine, parseLast, PROJECT_KEY, projectItems, projectSummary,
  rememberRoute, rememberScreen, resolveProject, searchEntries, sortEntries, startScreenOf, thumbFit, type Entry, type Filter, type Last, type Sessions,
  describeSceneEntries, isScene, POSTER_CONCURRENCY, posterFresh, sceneActions, sceneChips, scenePosterAtKey, scenePosterKey,
} from "./landing.ts";
import { hrefActivity, hrefCanvas, hrefPlay, hrefScene, hrefWalk, hrefWatch, type ProjectInfo } from "./state.ts";
import type { Scene } from "../src/scene.ts";
import { hasWebGL2 } from "./webgl.ts";

const SCENE_KINDS = ["scene.set", "films.set", "page.set", "scene.removed"];
const POSTER_WIDTH = 480;
type SceneDetail = { scene: Scene; hasPage: boolean };

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
  const bannerEl = $("ld-banner");
  const continueEl = $("ld-continue");
  const chipsEl = $("ld-chips");
  const galleryEl = $("ld-gallery");
  const searchEl = $("ld-search") as HTMLInputElement;
  const slot = $("ld-tools");
  const headEl = $("ld-head");
  const projBtn = $("ld-project");
  const projName = $("ld-pname");
  const menuEl = $("ld-menu");
  const newDlg = $("ld-newdlg") as HTMLDialogElement;

  let visible = false;
  let dirty = true;
  let settled = false; // false until the first websocket backfill has had time to arrive: no empty state before that
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loadSeq = 0;
  let entries: Entry[] = [];
  let query = "";
  let filter: Filter = "all";
  let project = ""; // the project on show; "" only while Lite knows no project
  let scoped: Entry[] = []; // the entries of that project: nothing from another project is ever drawn
  let savedProject: string | null = null;
  let sessions: Sessions = {};
  let last: Last | null = null;
  try {
    last = parseLast(localStorage.getItem(LAST_KEY));
    savedProject = localStorage.getItem(PROJECT_KEY);
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

  /** Hover Watch on a card: only once the canvas detail (fetched for the thumbnail) shows it has scenarios. */
  function addWatch(box: HTMLElement, e: Entry, d: CanvasDetail | null) {
    const scrim = box.parentElement?.querySelector(".ld-scrim");
    if (!d || d.scenarios.length === 0 || !scrim || scrim.querySelector(".ld-watch")) return;
    const a = link(hrefWatch(e.pid, e.id), "ld-btn glassy ld-watch", "Watch", `Watch a scenario of ${e.name}`);
    scrim.append(a);
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
            if (e) void loadDetail(e).then((d) => { mountThumb(box, d); addWatch(box, e, d); });
          }
        }, { rootMargin: "200px" })
      : null;

  // --- scene cards: detail (sky, page) and a lazily rendered poster ------------------
  const sceneDetails = new Map<string, Promise<SceneDetail | null>>(); // by project/scene/updated_at
  function loadSceneDetail(e: Entry): Promise<SceneDetail | null> {
    const key = `${e.pid}/${e.id}/${e.updated_at}`;
    let p = sceneDetails.get(key);
    if (!p) {
      p = fetch(`/api/projects/${e.pid}/scenes/${e.id}`, { headers: deps.headers() })
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) deps.locked();
          if (!res.ok) return null;
          const body = (await res.json()) as { scene?: Scene; page?: { sections?: unknown[] } | null };
          if (!body.scene || !body.scene.sky) return null;
          return { scene: body.scene, hasPage: Array.isArray(body.page?.sections) && body.page.sections.length > 0 };
        })
        .catch(() => null);
      sceneDetails.set(key, p);
      void p.then((d) => {
        if (d === null) sceneDetails.delete(key);
      });
    }
    return p;
  }

  const store = {
    get(k: string): string | null {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage full or blocked: no cached poster */
      }
    },
  };

  function showPoster(box: HTMLElement, src: string) {
    const img = el("img", "ld-poster");
    img.alt = "";
    img.src = src;
    box.querySelector(".ld-poster")?.remove();
    box.append(img);
    box.classList.add("ready");
  }

  // Posters are rendered offscreen with the scene renderer, at most POSTER_CONCURRENCY at a time and never while the landing or the tab is hidden.
  type PosterJob = { box: HTMLElement; e: Entry; scene: Scene };
  const posterQueue: PosterJob[] = [];
  let rendering = 0;
  let sceneRender: Promise<typeof import("./scene-render.ts")> | null = null;
  function pumpPosters() {
    while (rendering < POSTER_CONCURRENCY && posterQueue.length && visible && !document.hidden) {
      const job = posterQueue.shift()!;
      if (!job.box.isConnected) continue;
      rendering++;
      void renderPoster(job).finally(() => {
        rendering--;
        pumpPosters();
      });
    }
  }
  document.addEventListener("visibilitychange", pumpPosters);

  async function renderPoster({ box, e, scene }: PosterJob): Promise<void> {
    if (!hasWebGL2()) return;
    let m: typeof import("./scene-render.ts");
    try {
      m = await (sceneRender ??= import("./scene-render.ts"));
    } catch {
      sceneRender = null;
      return;
    }
    if (!box.isConnected || !visible || document.hidden) return void posterQueue.push({ box, e, scene });
    const host = el("div", "ld-offscreen");
    document.body.append(host);
    let url = "";
    try {
      const v = m.createSceneView(host, scene);
      v.resize();
      url = v.poster();
      v.dispose();
    } catch {
      /* a lost or refused context: keep the sky gradient */
    } finally {
      host.remove();
    }
    if (!url) return;
    const small = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = POSTER_WIDTH;
        c.height = Math.max(1, Math.round((POSTER_WIDTH * img.height) / Math.max(1, img.width)));
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve(url);
      img.src = url;
    });
    store.set(scenePosterKey(e.pid, e.id), small);
    store.set(scenePosterAtKey(e.pid, e.id), String(e.updated_at));
    if (box.isConnected) showPoster(box, small);
  }

  /** Fills a scene card once its detail arrives: sky gradient, chips, hover buttons, then the cached or a newly rendered poster. */
  function fillScene(box: HTMLElement, e: Entry, d: SceneDetail | null) {
    if (!d) return;
    box.style.background = `linear-gradient(${d.scene.sky.top}, ${d.scene.sky.bottom})`;
    const card = box.closest(".ld-card");
    const chips = card?.querySelector(".ld-schips");
    if (chips) chips.replaceChildren(...sceneChips(e, d.hasPage).map((t) => el("span", "ld-schip", t)));
    const scrim = card?.querySelector(".ld-scrim");
    if (scrim) scrim.replaceChildren(...sceneButtons(e, d.hasPage));
    const cached = store.get(scenePosterKey(e.pid, e.id));
    if (cached && posterFresh(cached, store.get(scenePosterAtKey(e.pid, e.id)), e.updated_at)) return showPoster(box, cached);
    posterQueue.push({ box, e, scene: d.scene });
    pumpPosters();
  }

  function sceneButtons(e: Entry, hasPage: boolean): HTMLElement[] {
    return sceneActions(e, hasPage).map((a, i) => {
      const b = link(a.href, i === 0 ? "ld-btn blue" : "ld-btn glassy", "", `${a.label} ${e.name}`);
      if (a.label === "Watch") b.append(icon(PLAY_ICON, 12, true));
      b.append(document.createTextNode(a.label));
      return b;
    });
  }

  const sceneIo =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((items) => {
          for (const it of items) {
            if (!it.isIntersecting) continue;
            sceneIo!.unobserve(it.target);
            const box = it.target as HTMLElement & { _entry?: Entry };
            const e = box._entry;
            if (e) void loadSceneDetail(e).then((d) => fillScene(box, e, d));
          }
        }, { rootMargin: "100px" })
      : null;

  function sceneThumb(e: Entry): HTMLElement {
    const box = el("div", "ld-thumb ld-sthumb") as HTMLElement & { _entry?: Entry };
    box._entry = e;
    box.append(el("span", "ld-sname", e.name));
    if (sceneIo) sceneIo.observe(box);
    else void loadSceneDetail(e).then((d) => fillScene(box, e, d));
    return box;
  }

  function sceneCard(e: Entry): HTMLElement {
    const c = el("article", "ld-card glass ld-scene");
    const scrim = el("div", "ld-scrim");
    scrim.append(...sceneButtons(e, false));
    const wrap = el("div", "ld-thumbwrap");
    wrap.append(sceneThumb(e), scrim);
    const body = el("div", "ld-body");
    const name = link(hrefScene(e.pid, e.id), "ld-name", e.name); // its ::after covers the card: a click opens Orbit
    const label = project === "" ? el("div", "ld-plabel", e.project) : null;
    const meta = el("div", "ld-meta", metaLine(e, now()));
    meta.dataset.kind = "scene";
    meta.dataset.drawables = String(e.drawables ?? 0);
    meta.dataset.ts = String(e.updated_at);
    const chips = el("div", "ld-schips");
    chips.append(...sceneChips(e, false).map((t) => el("span", "ld-schip", t)));
    const b = badgeOf(e);
    const row = el("div", "ld-srow");
    row.append(el("span", `ld-badge ${b.kind}`, b.text), chips);
    if (label) body.append(name, label, meta, row);
    else body.append(name, meta, row);
    c.append(wrap, body);
    return c;
  }

  function thumb(e: Entry, eager: boolean): HTMLElement {
    const box = el("div", "ld-thumb") as HTMLElement & { _entry?: Entry };
    box._entry = e;
    if (e.screens === 0) box.classList.add("empty");
    else if (eager || !io) void loadDetail(e).then((d) => { mountThumb(box, d); addWatch(box, e, d); });
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
          const [res, sres] = await Promise.all([
            fetch(`/api/projects/${p.id}/canvases`, { headers: deps.headers() }),
            fetch(`/api/projects/${p.id}/scenes`, { headers: deps.headers() }).catch(() => null),
          ]);
          if (res.status === 401 || res.status === 403) deps.locked();
          const designs = res.ok ? describeEntries(p.id, p.name, await res.json()) : [];
          const scenes = sres?.ok ? describeSceneEntries(p.id, p.name, await sres.json()) : []; // an older server without scenes: none
          return [...designs, ...scenes];
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
    const cm = last ? continueModel(last, scoped, nameOf(last.project, last.canvas), now()) : null;
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
    const cm = last ? continueModel(last, scoped, nameOf(last.project, last.canvas), now()) : null;
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
    if (isScene(e)) return sceneCard(e);
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

  /** The switcher button, the heading under it and the menu of every project (empty ones too) plus the New project how-to. */
  function drawProjects(all: Entry[]) {
    const items = projectItems(deps.projects(), all);
    project = resolveProject(savedProject, items);
    scoped = filterByProject(all, project);
    const cur = items.find((p) => p.id === project);
    projBtn.hidden = headEl.hidden = !cur;
    if (!cur) return;
    projName.textContent = cur.name;
    headEl.replaceChildren(el("h1", undefined, cur.name), el("div", "ld-hmeta", projectSummary(scoped)));
    const add = el("button", "ld-mit new");
    add.type = "button";
    add.dataset.new = "1";
    add.append(el("b", undefined, "+ New project"), el("span", undefined, "ask Claude"));
    menuEl.replaceChildren(
      el("div", "ld-mcap", "Projects"),
      ...items.map((p) => {
        const b = el("button", p.id === project ? "ld-mit on" : "ld-mit");
        b.type = "button";
        b.dataset.project = p.id;
        b.append(el("b", undefined, p.name), el("span", undefined, p.id === project ? `${p.meta} ✓` : p.meta));
        return b;
      }),
      el("div", "ld-msep"),
      add,
    );
  }

  function drawGallery() {
    const shown = sortEntries(applyFilter(searchEntries(scoped, query), filter));
    if (scoped.length === 0) {
      const name = projName.textContent ?? "";
      galleryEl.replaceChildren(
        settled && project ? el("p", "ld-empty", name ? `Nothing yet in ${name}. Ask Claude to design something.` : "Nothing yet. Ask Claude to design something.") : el("p", "ld-empty"),
      );
      return;
    }
    if (shown.length === 0) return galleryEl.replaceChildren(el("p", "ld-empty", "No designs match."));
    const grid = el("div", "ld-grid");
    grid.append(...shown.map(card));
    galleryEl.replaceChildren(grid);
  }

  function render() {
    if (!visible) return;
    drawBanner();
    drawProjects(entries);
    drawContinue();
    drawChips(scoped);
    drawGallery();
  }

  // The gallery redraws on data and on filter/search changes; relative times tick in place so thumbnails never reload.
  setInterval(() => {
    if (!visible) return;
    for (const m of galleryEl.querySelectorAll<HTMLElement>(".ld-meta")) {
      const kind = m.dataset.kind === "scene" ? ("scene" as const) : undefined;
      m.textContent = metaLine({ screens: Number(m.dataset.screens ?? 0), updated_at: Number(m.dataset.ts), kind, drawables: Number(m.dataset.drawables ?? 0) }, now());
    }
    tickContinue();
  }, 30_000);

  // The menu is a native popover (light dismiss and Esc for free); the New project row opens a how-to dialog, since this page only reads.
  menuEl.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("button");
    if (!b) return;
    menuEl.hidePopover();
    if (b.dataset.new) return newDlg.showModal();
    project = savedProject = b.dataset.project ?? "";
    try {
      localStorage.setItem(PROJECT_KEY, project);
    } catch {
      /* ignore */
    }
    query = ""; // a search or filter of one project does not follow you to the next
    searchEl.value = "";
    filter = "all";
    render();
  });
  menuEl.addEventListener("beforetoggle", (ev) => {
    if ((ev as ToggleEvent).newState !== "open") return;
    const r = projBtn.getBoundingClientRect();
    menuEl.style.left = `${r.left}px`;
    menuEl.style.top = `${r.bottom + 6}px`;
  });
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
      pumpPosters();
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
      if (row.kind === "project.opened" || row.kind === "project.removed" || CANVAS_KINDS.includes(row.kind) || SCENE_KINDS.includes(row.kind)) schedule(row.kind.startsWith("project.") ? 150 : 400);
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
