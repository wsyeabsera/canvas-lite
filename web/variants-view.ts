// DOM wiring of the compare page (`#/project/<id>/canvas/<cid>/variants`, docs/variants.md). Reads `GET .../variants`; its one write is the
// Fork dialog (POST .../fork). Thumbnails are the start screen in an empty-sandbox srcdoc iframe, like the landing. Rules live in variants.ts.
import { describeCanvasDetail, iframeSpec } from "./canvas.ts";
import { startScreenOf, thumbFit } from "./landing.ts";
import { anchor, el, showSentence, tabs, topBar } from "./chrome.ts";
import { closeModal, openModal, rise } from "./motion.ts";
import { hrefCanvas, hrefTournament, hrefVariants } from "./state.ts";
import { describeVariants, forkSentence, variantsLabel, type Card, type VariantsModel } from "./variants.ts";

export interface VariantsScreen {
  toolsSlot: HTMLElement;
  open(project: string, canvas: string): void;
  /** A live event of the project on show: refetch. */
  refetch(): void;
  close(): void;
}

type Deps = { headers: () => Record<string, string>; locked: () => void; projectName: (project: string) => string };

export function createVariantsScreen(host: HTMLElement, deps: Deps): VariantsScreen {
  const tools = el("div", "ld-tools");
  let pid = "";
  let cid = "";
  let model: VariantsModel | null = null;
  let state: "loading" | "ready" | "failed" = "loading";
  let seq = 0;
  let played = false; // the entrance plays once per open, not on every live refetch

  async function thumb(box: HTMLElement, c: Card) {
    try {
      const res = await fetch(`/api/projects/${pid}/canvases/${c.id}`, { headers: deps.headers() });
      if (!res.ok) return;
      const d = describeCanvasDetail(await res.json());
      const s = d ? startScreenOf(d.screens, d.canvas.start_screen) : null;
      if (!s || !box.isConnected) return;
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
      const fit = thumbFit(spec.width, spec.height, box.clientWidth, box.clientHeight);
      Object.assign(f.style, { transform: `scale(${fit.scale})`, left: `${fit.left}px`, top: `${fit.top}px` });
      box.replaceChildren(f);
      box.classList.add("ready");
    } catch {
      /* the gradient stays */
    }
  }

  function card(c: Card): HTMLElement {
    const box = el("article", `vr-card glass tone-${c.tone}`);
    const head = el("div", "vr-head");
    const t = el("b", "vr-name");
    t.append(el("i", "vr-dot"), c.base ? "Base" : c.name);
    head.append(t, el("span", "chip", c.base ? "current" : "variant"));
    const th = el("div", "vr-thumb");
    box.append(head, th, el("div", "ld-hmeta", c.line));
    box.append(anchor(hrefCanvas(pid, c.id), "vr-open", `Open ${c.name}`));
    void thumb(th, c);
    return box;
  }

  async function openFork(m: VariantsModel) {
    const d = el("dialog", "ld-newdlg vr-fork");
    const name = el("input", "vr-input");
    name.placeholder = `Variant ${String.fromCharCode(65 + m.variants.length)}`;
    name.maxLength = 100;
    const now = el("input");
    now.type = "radio";
    now.name = "from";
    now.checked = true;
    const earlier = el("input");
    earlier.type = "radio";
    earlier.name = "from";
    const slider = el("input");
    slider.type = "range";
    slider.disabled = true;
    const at = el("div", "ld-hmeta");
    const err = el("p", "lg-msg");
    let seqs: number[] = [];
    try {
      const r = await fetch(`/api/projects/${pid}/canvases/${m.base.id}/timeline`, { headers: deps.headers() });
      if (r.ok) seqs = ((await r.json()) as { events?: { seq: number }[] }).events?.map((e) => e.seq).filter((s) => Number.isInteger(s)) ?? [];
    } catch {
      /* only "now" is offered */
    }
    slider.max = String(Math.max(0, seqs.length - 1));
    slider.value = slider.max;
    earlier.disabled = seqs.length < 2;
    const sync = () => {
      slider.disabled = !earlier.checked;
      at.textContent = earlier.checked ? `As it was after change ${seqs[Number(slider.value)]} of ${seqs[seqs.length - 1]}` : "The design as it is now";
    };
    for (const e of [now, earlier, slider]) e.addEventListener("input", sync);
    sync();
    const lbl = (input: HTMLInputElement, text: string) => {
      const l = el("label", "vr-radio");
      l.append(input, text);
      return l;
    };
    const cancel = el("button", "ld-btn outline", "Cancel");
    const go = el("button", "ld-btn blue", "Fork");
    cancel.type = go.type = "button";
    cancel.addEventListener("click", () => closeModal(d));
    go.addEventListener("click", async () => {
      go.disabled = true;
      err.textContent = "";
      try {
        const body: { name: string; seq?: number } = { name: name.value.trim() || name.placeholder };
        if (earlier.checked) body.seq = seqs[Number(slider.value)];
        const res = await fetch(`/api/projects/${pid}/canvases/${m.base.id}/fork`, { method: "POST", headers: { ...deps.headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.status === 401 || res.status === 403) deps.locked();
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not fork.");
        closeModal(d);
        void load();
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : "Could not fork.";
      } finally {
        go.disabled = false;
      }
    });
    const row = el("div", "ad-actions");
    row.append(cancel, go);
    d.append(el("h2", undefined, `Fork ${m.base.name}`), el("p", "ld-hmeta", "Claude can fork several at once. Fork by hand to try a direction yourself."), el("div", "cap", "Name"), name, el("div", "cap", "Start from"), lbl(now, "Now"), lbl(earlier, "An earlier point"), slider, at, err, row);
    d.addEventListener("close", () => d.remove());
    host.append(d);
    openModal(d);
    name.focus();
  }

  function draw() {
    const m = model;
    const parts: HTMLElement[] = [topBar({ href: "#/", text: deps.projectName(pid) }, tools)];
    const head = el("div", "ld-head");
    const title = el("div");
    title.append(el("h1", undefined, m?.base.name ?? "Variants"), el("div", "ld-hmeta", m ? `${variantsLabel(m.variants.length)} forked from the base` : ""));
    head.append(title, tabs("compare", { compare: hrefVariants(pid, cid), tournament: hrefTournament(pid, cid) }));
    parts.push(head);
    if (state !== "ready" || !m) parts.push(el("p", "ld-empty", state === "failed" ? "Could not load the variants." : ""));
    else if (m.variants.length === 0) {
      const empty = el("div", "ld-empty");
      empty.append(el("b", "ds-none", "Try it three ways"), el("div", "ld-hmeta", "Ask Claude to fork this design into variants, then run a tournament."), el("div", "ld-code", forkSentence(m.base.name)));
      const fork = el("button", "ld-btn blue", "Fork it myself");
      fork.type = "button";
      fork.addEventListener("click", () => void openFork(m));
      empty.append(fork);
      parts.push(empty);
    } else {
      const row = el("div", "vr-row");
      const cards = [m.base, ...m.variants].map(card);
      row.append(...cards);
      const acts = el("div", "vr-acts");
      const fork = el("button", "ld-btn blue", "Fork");
      const run = el("button", "ld-btn outline", "Run tournament");
      fork.type = run.type = "button";
      fork.addEventListener("click", () => void openFork(m));
      run.addEventListener("click", () => showSentence(host, "Run a tournament", "Blind users walk every variant toward the same goals. This page only reads, so ask Claude in your terminal:", `run a tournament on ${m.base.name}: buy a ticket, change the address, pay with a saved card`));
      acts.append(fork, run, anchor(hrefCanvas(pid, m.base.id), "ld-btn outline", "Open the base"), el("span", "ld-hmeta", "Click a card to open it. Claude forks and keeps a winner; Fork here is for trying your own."));
      parts.push(row, acts);
      if (!played) {
        played = true;
        rise(cards);
      }
    }
    host.replaceChildren(...parts);
  }

  async function load() {
    const mine = ++seq;
    try {
      const res = await fetch(`/api/projects/${pid}/canvases/${cid}/variants`, { headers: deps.headers() });
      if (res.status === 401 || res.status === 403) deps.locked();
      if (mine !== seq) return;
      if (!res.ok) throw new Error(String(res.status));
      model = describeVariants(await res.json());
      state = model ? "ready" : "failed";
    } catch {
      if (mine !== seq) return;
      state = "failed";
    }
    draw();
  }

  return {
    toolsSlot: tools,
    open(project, canvas) {
      if (project !== pid || canvas !== cid) {
        pid = project;
        cid = canvas;
        model = null;
        state = "loading";
        played = false;
      }
      draw();
      void load();
    },
    refetch() {
      void load();
    },
    close() {
      seq++;
      played = false;
    },
  };
}
