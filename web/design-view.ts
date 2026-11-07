// DOM wiring of the design-system page (`#/project/<id>/design`, docs/design-system.md). Read-only: it only issues a GET.
// Rules and shaping live in design.ts (unit tested). Every token is put in with textContent or a validated style value, never as markup.
import { agoText } from "./canvas.ts";
import { describeDesign, designSummary, paintable, type DesignModel, type DesignTab } from "./design.ts";
import { hrefLanding } from "./state.ts";

export interface DesignScreen {
  /** The slot the theme pill and docs link move into while the page is on screen. */
  toolsSlot: HTMLElement;
  open(project: string): void;
  /** A live `design.set` for the project on show. */
  refetch(): void;
  close(): void;
}

type Deps = { headers: () => Record<string, string>; locked: () => void; projectName: (project: string) => string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createDesignScreen(host: HTMLElement, deps: Deps): DesignScreen {
  const tools = el("div", "ld-tools");
  let pid = "";
  let model: DesignModel | null = null;
  let state: "loading" | "ready" | "failed" = "loading";
  let tab: DesignTab = "tokens";
  let seq = 0;

  function tokens(m: DesignModel): HTMLElement {
    const wrap = el("div", "ds-grid");
    for (const g of m.groups) {
      const card = el("div", g.key === "colors" ? "ds-card glass wide" : "ds-card glass");
      card.append(el("h2", undefined, g.title));
      if (g.key === "colors") {
        const row = el("div", "ds-sws");
        for (const t of g.tokens) {
          const sw = el("div", "ds-sw");
          const chip = el("i");
          if (paintable(t.value)) chip.style.background = t.value;
          sw.append(chip, el("b", undefined, t.name), el("span", undefined, String(t.value)));
          row.append(sw);
        }
        card.append(row);
      } else
        for (const t of g.tokens) {
          const r = el("div", "ds-row");
          const sample = el("div", undefined, t.name);
          if (g.key === "fonts") sample.style.setProperty("font-family", String(t.value));
          if (g.key === "sizes" && typeof t.value === "number") sample.style.fontSize = `${t.value}px`;
          if (g.key === "space" && typeof t.value === "number") sample.prepend(Object.assign(el("i", "ds-bar"), { style: `width:${t.value}px` }));
          if (g.key === "radius" && typeof t.value === "number") sample.prepend(Object.assign(el("i", "ds-rd"), { style: `border-radius:${t.value}px` }));
          r.append(sample, el("span", undefined, g.key === "fonts" ? String(t.value) : `${t.value}`));
          card.append(r);
        }
      wrap.append(card);
    }
    if (m.rules.trim()) {
      const card = el("div", "ds-card glass wide");
      card.append(el("h2", undefined, "Rules"), el("div", "ds-rules", m.rules));
      wrap.append(card);
    }
    return wrap;
  }

  function draw() {
    const name = deps.projectName(pid);
    const back = Object.assign(el("a", "ds-back glass", `← ${name}`), { href: hrefLanding });
    const top = el("header", "ld-top");
    top.append(Object.assign(el("a", "ld-brand", "Lite"), { href: hrefLanding }), back, tools);
    const parts: HTMLElement[] = [top];
    const head = el("div", "ld-head");
    head.append(el("h1", undefined, "Design system"));
    parts.push(head);
    if (state !== "ready") {
      head.append(el("div", "ld-hmeta", name));
      parts.push(el("p", "ld-empty", state === "loading" ? "" : "Could not load the design system."));
    } else if (!model) {
      head.append(el("div", "ld-hmeta", name));
      const empty = el("div", "ld-empty");
      empty.append(el("b", "ds-none", `No design system in ${name} yet`), el("div", "ld-hmeta", "Claude reads it before designing, so screens do not drift. Ask Claude to set one."), el("div", "ld-code", `set the ${name} design system: dark, one blue accent, pill buttons`));
      parts.push(empty);
    } else {
      const m = model;
      head.append(el("div", "ld-hmeta", `${name} · updated ${agoText(m.updated_at, Date.now())} · ${designSummary(m)}`));
      const tabs = el("div", "ds-tabs glass");
      for (const [key, label] of [["tokens", "Tokens"], ["markdown", "DESIGN.md"]] as const) {
        const b = el("button", key === tab ? "ds-tab on" : "ds-tab", label);
        b.type = "button";
        b.setAttribute("aria-pressed", String(key === tab));
        b.addEventListener("click", () => {
          tab = key;
          draw();
        });
        tabs.append(b);
      }
      head.append(tabs);
      parts.push(tab === "tokens" ? tokens(m) : Object.assign(el("pre", "ds-doc"), { textContent: m.markdown }));
    }
    host.replaceChildren(...parts);
  }

  async function load() {
    const mine = ++seq;
    try {
      const res = await fetch(`/api/projects/${pid}/design`, { headers: deps.headers() });
      if (res.status === 401 || res.status === 403) deps.locked();
      if (mine !== seq) return;
      if (!res.ok) throw new Error(String(res.status));
      model = describeDesign(await res.json());
      state = "ready";
    } catch {
      if (mine !== seq) return;
      state = "failed";
    }
    draw();
  }

  return {
    toolsSlot: tools,
    open(project) {
      if (project !== pid) {
        pid = project;
        model = null;
        state = "loading";
        tab = "tokens";
      }
      draw();
      void load();
    },
    refetch() {
      void load();
    },
    close() {
      seq++; // a late answer is dropped
    },
  };
}
