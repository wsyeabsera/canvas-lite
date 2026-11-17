// DOM for the shared state block (words and rules: web/states.ts).
import { stateText, type StateAction, type StateKind } from "./states.ts";

/** A centred block with a title, a hint and actions. `loading` is a polite status; `error` and `missing` are alerts. */
export function stateBlock(kind: StateKind, subject: string, actions: readonly StateAction[] = [], text = stateText(kind, subject)): HTMLElement {
  const box = document.createElement("div");
  box.className = `st-block st-${kind}`;
  box.setAttribute("role", kind === "error" || kind === "missing" ? "alert" : "status");
  const t = document.createElement("b");
  t.textContent = text.title;
  box.append(t);
  if (text.hint) {
    const p = document.createElement("span");
    p.textContent = text.hint;
    box.append(p);
  }
  if (actions.length) {
    const row = document.createElement("div");
    row.className = "st-actions";
    for (const a of actions) {
      const el = document.createElement(a.href ? "a" : "button");
      el.className = "ld-btn outline";
      el.textContent = a.label;
      if (el instanceof HTMLAnchorElement && a.href) el.href = a.href;
      else if (el instanceof HTMLButtonElement) el.type = "button";
      if (a.onClick) el.addEventListener("click", a.onClick);
      row.append(el);
    }
    box.append(row);
  }
  return box;
}
