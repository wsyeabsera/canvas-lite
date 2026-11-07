// DOM wiring of the admin page (`#/admin`, docs/auth.md). Reads `GET /api/admin/overview`; its one action is POST .../archive after a native
// confirm dialog. Rules and shaping live in admin.ts (unit tested). Every value goes in with textContent.
import { activityText, archiveFailure, describeOverview, projectNote, type AdminModel } from "./admin.ts";
import { hrefLanding } from "./state.ts";

export interface AdminScreen {
  toolsSlot: HTMLElement;
  open(): void;
  /** A live event of any project: refetch, at most once a second. */
  refetch(): void;
  close(): void;
}

type Deps = { headers: () => Record<string, string>; locked: () => void; session: () => boolean; signOut: () => void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createAdminScreen(host: HTMLElement, deps: Deps): AdminScreen {
  const tools = el("div", "ld-tools");
  let model: AdminModel | null = null;
  let state: "loading" | "ready" | "failed" = "loading";
  let note: { kind: "ok" | "bad"; text: string } | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dlg = el("dialog", "ld-newdlg");

  function confirmArchive(id: string, name: string) {
    const cancel = el("button", "ld-btn outline", "Cancel");
    const go = el("button", "ld-btn ad-danger", `Archive ${name}`);
    cancel.type = go.type = "button";
    cancel.addEventListener("click", () => dlg.close());
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        const res = await fetch(`/api/admin/projects/${id}/archive`, { method: "POST", headers: deps.headers() });
        if (res.status === 401 || res.status === 403) deps.locked();
        note = res.ok ? { kind: "ok", text: `${name} archived. Claude can bring it back with open_project.` } : { kind: "bad", text: archiveFailure(res.status, await res.json().catch(() => null)) };
      } catch {
        note = { kind: "bad", text: archiveFailure(0, null) };
      }
      dlg.close();
      void load();
    });
    const row = el("div", "ad-actions");
    row.append(cancel, go);
    dlg.replaceChildren(el("h2", undefined, `Archive ${name}?`), el("p", "ld-hmeta", "It disappears from the project switcher. Nothing is deleted: Claude can bring it back with open_project."), row);
    dlg.showModal();
  }

  function draw() {
    const top = el("header", "ld-top");
    const back = Object.assign(el("a", "ds-back glass", "← Designs"), { href: hrefLanding });
    top.append(Object.assign(el("a", "ld-brand", "Lite"), { href: hrefLanding }), back, tools);
    if (deps.session()) {
      const out = el("button", "ds-back glass ad-out", "Sign out");
      out.type = "button";
      out.addEventListener("click", deps.signOut);
      top.append(out);
    }
    const head = el("div", "ld-head");
    const title = el("div");
    title.append(el("h1", undefined, "Admin"), el("div", "ld-hmeta", "Everything Lite holds, in one place"));
    head.append(title);
    const parts: HTMLElement[] = [top, head];
    if (note) parts.push(el("div", note.kind === "ok" ? "ad-note ok" : "ad-note bad", note.text));
    if (state !== "ready" || !model) parts.push(el("p", "ld-empty", state === "failed" ? "Could not load the overview." : ""));
    else {
      const stats = el("div", "ad-stats");
      for (const [label, n] of [["Projects", model.totals.projects], ["Designs", model.totals.designs], ["Scenes", model.totals.scenes], ["Events", model.totals.events]] as const) {
        const c = el("div", "ds-card glass");
        c.append(el("b", "ad-n", String(n)), el("span", "ld-hmeta", label));
        stats.append(c);
      }
      const tbl = el("div", "ds-card glass ad-tbl");
      tbl.append(el("h2", undefined, "Projects"));
      const hd = el("div", "ad-r hd");
      hd.append(el("span", undefined, "Project"), el("span", undefined, "Designs"), el("span", undefined, "Scenes"), el("span", undefined, "Last activity"), el("span"));
      tbl.append(hd);
      const now = Date.now();
      for (const p of model.projects) {
        const r = el("div", "ad-r");
        const act = el("span", "ad-act");
        if (p.archivable) {
          const b = el("button", "ad-arch", "Archive");
          b.type = "button";
          b.addEventListener("click", () => confirmArchive(p.id, p.name));
          act.append(b);
        } else act.textContent = projectNote(p);
        r.append(el("b", undefined, p.name), el("span", undefined, String(p.designs)), el("span", undefined, String(p.scenes)), el("span", "ld-hmeta", activityText(p, now)), act);
        tbl.append(r);
      }
      parts.push(stats, tbl, el("p", "ld-hmeta ad-foot", "Only an empty project can be archived here. Claude can bring one back with open_project."));
    }
    host.replaceChildren(...parts, dlg);
  }

  async function load() {
    const mine = ++seq;
    try {
      const res = await fetch("/api/admin/overview", { headers: deps.headers() });
      if (res.status === 401 || res.status === 403) deps.locked();
      if (mine !== seq) return;
      if (!res.ok) throw new Error(String(res.status));
      model = describeOverview(await res.json());
      state = model ? "ready" : "failed";
    } catch {
      if (mine !== seq) return;
      state = "failed";
    }
    draw();
  }

  return {
    toolsSlot: tools,
    open() {
      note = null;
      draw();
      void load();
    },
    refetch() {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 1000);
    },
    close() {
      seq++;
      clearTimeout(timer);
      if (dlg.open) dlg.close();
    },
  };
}
