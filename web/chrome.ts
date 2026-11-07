// Small DOM helpers shared by the variants views: the element builder, the top bar and a how-to dialog. DOM only.
import { hrefLanding } from "./state.ts";
import { closeModal, openModal } from "./motion.ts";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const anchor = (href: string, cls: string, text: string): HTMLAnchorElement => Object.assign(el("a", cls, text), { href });

/** The top bar of a secondary page: wordmark, a back pill, and the slot the theme pill and docs link move into. */
export function topBar(back: { href: string; text: string }, tools: HTMLElement): HTMLElement {
  const top = el("header", "ld-top");
  top.append(anchor(hrefLanding, "ld-brand", "Lite"), anchor(back.href, "ds-back glass", `← ${back.text}`), tools);
  return top;
}

/** The Compare | Tournament switch. */
export function tabs(on: "compare" | "tournament", hrefs: { compare: string; tournament: string }): HTMLElement {
  const t = el("div", "ds-tabs glass");
  for (const [key, label] of [["compare", "Compare"], ["tournament", "Tournament"]] as const) t.append(anchor(hrefs[key], key === on ? "ds-tab on" : "ds-tab", label));
  return t;
}

/** The page only reads, so some actions are sentences to say to Claude: a dialog with the exact sentence, shown with the modal transition. */
export function sentenceDialog(title: string, why: string, sentence: string): HTMLDialogElement {
  const d = el("dialog", "ld-newdlg");
  const ok = el("button", "ld-btn blue", "Got it");
  ok.type = "button";
  ok.addEventListener("click", () => closeModal(d));
  d.append(el("h2", undefined, title), el("p", "ld-hmeta", why), el("div", "ld-code", sentence), el("div", "ad-actions"));
  d.lastElementChild!.append(ok);
  return d;
}
export const showSentence = (host: HTMLElement, title: string, why: string, sentence: string) => {
  const d = sentenceDialog(title, why, sentence);
  d.addEventListener("close", () => d.remove());
  host.append(d);
  openModal(d);
};
