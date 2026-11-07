// DOM wiring of the tournament results page (`.../tournament`) and the walk trace (`.../trace/<walk>`), docs/variants.md. Read-only: Keep is a
// sentence to say to Claude. Rules and shaping live in variants.ts (unit tested). Every value goes in with textContent.
import { agoText } from "./canvas.ts";
import { anchor, el, showSentence, tabs, topBar } from "./chrome.ts";
import { rise } from "./motion.ts";
import { hrefTournament, hrefTrace, hrefVariants } from "./state.ts";
import { columnProgress, describeResults, describeVariants, keepSentence, NODE_H, NODE_W, percent, traceLayout, walkSummary, type ResultsModel } from "./variants.ts";

export interface TournamentScreen {
  toolsSlot: HTMLElement;
  openResults(project: string, canvas: string): void;
  openTrace(project: string, canvas: string, walk: string): void;
  refetch(): void;
  close(): void;
}

type Deps = { headers: () => Record<string, string>; locked: () => void; projectName: (project: string) => string };
type WalkApi = {
  walk: string; canvas: string; goal: string; target: string; status: string; path: string[]; note: string; started_at: number;
  steps: { from: string; to: string; label: string; wrong: boolean }[]; score: { steps: number; shortest: number | null; wrong_turns: number; dead_ends: number };
  screens: { id: string; name: string; links: string[] }[];
};

export function createTournamentScreen(host: HTMLElement, deps: Deps): TournamentScreen {
  const tools = el("div", "ld-tools");
  let mode: "results" | "trace" | null = null;
  let pid = "";
  let cid = "";
  let walk = "";
  let seq = 0;
  let played = false;
  let results: ResultsModel | null = null;
  let progress: { id: string; done: number; total: number }[] = [];
  let baseName = "";
  let trace: WalkApi | null = null;
  let state: "loading" | "ready" | "none" | "failed" = "loading";

  const get = async (url: string) => {
    const res = await fetch(url, { headers: deps.headers() });
    if (res.status === 401 || res.status === 403) deps.locked();
    if (!res.ok) throw new Error(String(res.status));
    return res.json() as Promise<unknown>;
  };

  function drawResults() {
    const parts: HTMLElement[] = [topBar({ href: hrefVariants(pid, cid), text: "Variants" }, tools)];
    const head = el("div", "ld-head");
    const title = el("div");
    title.append(el("h1", undefined, baseName || "Tournament"), el("div", "ld-hmeta", results ? `${results.goals.length} goals · ${results.columns.length} versions · ${results.progress.total} walks planned by blind users` : ""));
    head.append(title, tabs("tournament", { compare: hrefVariants(pid, cid), tournament: hrefTournament(pid, cid) }));
    parts.push(head);
    const m = results;
    if (state !== "ready" || !m) {
      if (state === "none") {
        const empty = el("div", "ld-empty");
        empty.append(el("b", "ds-none", "No tournament yet"), el("div", "ld-hmeta", "Claude sends blind users through every version toward the same goals. Ask:"), el("div", "ld-code", `run a tournament on ${baseName || "this design"}`));
        parts.push(empty);
      } else parts.push(el("p", "ld-empty", state === "failed" ? "Could not load the tournament." : ""));
      host.replaceChildren(...parts);
      return;
    }
    const blocks: HTMLElement[] = [];
    if (!m.complete) {
      const card = el("div", "ds-card glass");
      const live = el("div", "cap");
      live.append(el("i", "vr-live"), `Claude is running blind users · ${m.progress.done} of ${m.progress.total} walks`);
      card.append(live);
      for (const col of m.columns) {
        const p = progress.find((x) => x.id === col.id) ?? { done: 0, total: 0 };
        const row = el("div", `vr-prog tone-${col.tone}`);
        const bar = el("div", "vr-bar");
        const fill = el("i");
        fill.style.width = `${percent(p.done, p.total)}%`;
        bar.append(fill);
        row.append(el("b", "vr-name", col.name), bar, el("span", "ld-hmeta", `${p.done} of ${p.total}`));
        card.append(row);
      }
      card.append(el("div", "ld-hmeta", "Each user starts knowing nothing about the design and sees only text and links."));
      blocks.push(card);
    }
    const grid = el("div", "ds-card glass vr-matrix");
    grid.style.setProperty("--cols", String(m.columns.length));
    const hd = el("div", "vr-mrow cap");
    hd.append(el("span", undefined, "Goal"), ...m.columns.map((c) => el("span", `tone-${c.tone}`, c.name)));
    grid.append(hd);
    for (const r of m.rows) {
      const row = el("div", "vr-mrow");
      row.append(el("b", undefined, r.goal));
      for (const c of r.cells) {
        const cell = c.walk ? anchor(hrefTrace(pid, cid, c.walk), `vr-cell ${c.tone}${c.best ? " best" : ""}`, "") : el("div", `vr-cell ${c.tone}${c.best ? " best" : ""}`);
        cell.append(el("b", undefined, c.text), el("div", "ld-hmeta", c.detail));
        row.append(cell);
      }
      grid.append(row);
    }
    blocks.push(grid);
    const lower = el("div", "vr-lower");
    const q = el("div", "ds-card glass");
    q.append(el("h2", undefined, "What users said they expected"));
    if (m.quotes.length === 0) q.append(el("div", "ld-hmeta", "No notes yet."));
    for (const x of m.quotes) q.append(el("div", `vr-quote tone-${x.tone}`, `${x.column}: “${x.text}”`));
    const read = el("div", "ds-card glass");
    read.append(el("h2", undefined, "Reading this"), el("div", undefined, "Green outlines mark the best result per goal. These are simulated users: a strong signal, not proof. Check the winner with real people before you ship."));
    const keeps = el("div", "ad-actions");
    for (const col of m.columns.filter((c) => c.tone !== "base")) {
      const b = el("button", "ld-btn outline", `Keep ${col.name}`);
      b.type = "button";
      b.addEventListener("click", () => showSentence(host, `Keep ${col.name}?`, "Claude merges it into the base as a new change, so the history stays one line. The old base is kept as a variant. This page only reads, so ask Claude in your terminal:", keepSentence(col.name, baseName)));
      keeps.append(b);
    }
    read.append(keeps);
    lower.append(q, read);
    blocks.push(lower);
    parts.push(...blocks);
    host.replaceChildren(...parts);
    if (!played) {
      played = true;
      rise(blocks);
    }
  }

  function drawTrace() {
    const parts: HTMLElement[] = [topBar({ href: hrefTournament(pid, cid), text: "Results" }, tools)];
    const t = trace;
    const head = el("div", "ld-head");
    const title = el("div");
    title.append(el("h1", undefined, "A blind user"), el("div", "ld-hmeta", t ? `Goal: ${t.goal} · ${walkSummary({ status: t.status, score: t.score })}` : ""));
    head.append(title);
    parts.push(head);
    if (state !== "ready" || !t) parts.push(el("p", "ld-empty", state === "failed" ? "Could not load the walk." : ""));
    else {
      const lay = traceLayout(t.screens, t.steps, t.path[0]);
      const stage = el("div", "ds-card glass vr-trace");
      stage.style.height = `${Math.max(lay.height, 160)}px`;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", String(lay.width));
      svg.setAttribute("height", String(lay.height));
      svg.setAttribute("aria-hidden", "true");
      const at = new Map(lay.nodes.map((n) => [n.id, n]));
      for (const e of lay.edges) {
        const a = at.get(e.from)!;
        const b = at.get(e.to)!;
        const line = document.createElementNS(ns, "line");
        const [ax, ay, bx, by] = a.x < b.x ? [a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2] : [a.x + NODE_W / 2, a.y + NODE_H, b.x + NODE_W / 2, b.y];
        for (const [k, v] of Object.entries({ x1: ax, y1: ay, x2: bx, y2: by })) line.setAttribute(k, String(v));
        line.setAttribute("class", `vr-edge ${e.kind}`);
        svg.append(line);
      }
      stage.append(svg);
      for (const n of lay.nodes) {
        const box = el("div", n.visited ? "vr-node on" : "vr-node", n.name);
        box.style.left = `${n.x}px`;
        box.style.top = `${n.y}px`;
        stage.append(box);
      }
      const words = el("div", "ds-card glass");
      words.append(el("h2", undefined, "In the user's words"), el("div", undefined, t.note ? `“${t.note}”` : "The user left no note."), el("div", "ld-hmeta", `Saw only visible text and link labels, never screen ids. Started ${agoText(t.started_at, Date.now())}.`));
      const score = el("div", "ds-card glass vr-score");
      for (const [label, n] of [["steps taken", t.score.steps], ["shortest path", t.score.shortest ?? "none"], ["wrong turns", t.score.wrong_turns], ["dead ends", t.score.dead_ends]] as const) {
        const c = el("div");
        c.append(el("b", "ad-n", String(n)), el("div", "ld-hmeta", label));
        score.append(c);
      }
      const lower = el("div", "vr-lower");
      lower.append(words, score);
      parts.push(stage, lower);
      if (!played) {
        played = true;
        rise([stage, lower]);
      }
    }
    host.replaceChildren(...parts);
  }

  async function load() {
    const mine = ++seq;
    try {
      if (mode === "trace") {
        trace = (await get(`/api/projects/${pid}/walks/${walk}`)) as WalkApi;
        state = "ready";
      } else {
        const v = describeVariants(await get(`/api/projects/${pid}/canvases/${cid}/variants`));
        if (mine !== seq) return;
        baseName = v?.base.name ?? "";
        if (!v?.tournament) {
          results = null;
          state = "none";
        } else {
          const raw = await get(`/api/projects/${pid}/tournaments/${v.tournament}`);
          results = describeResults(raw);
          progress = columnProgress(raw);
          state = results ? "ready" : "failed";
        }
      }
    } catch {
      if (mine !== seq) return;
      state = "failed";
    }
    if (mine !== seq) return;
    if (mode === "trace") drawTrace();
    else drawResults();
  }

  const reset = (m: "results" | "trace", project: string, canvas: string, w: string) => {
    if (mode !== m || project !== pid || canvas !== cid || w !== walk) {
      mode = m;
      pid = project;
      cid = canvas;
      walk = w;
      state = "loading";
      played = false;
      results = null;
      trace = null;
    }
    if (m === "trace") drawTrace();
    else drawResults();
    void load();
  };

  return {
    toolsSlot: tools,
    openResults: (project, canvas) => reset("results", project, canvas, ""),
    openTrace: (project, canvas, w) => reset("trace", project, canvas, w),
    refetch() {
      void load();
    },
    close() {
      seq++;
      played = false;
      mode = null;
    },
  };
}
