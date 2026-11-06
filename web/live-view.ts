// DOM for live play: the "Claude is presenting" pill, the Follow and Tour buttons in the play bar, the tour caption.
// Draws what follow.ts decides; holds no rules.
import type { Pill } from "./follow.ts";

export type LiveHooks = { takeOver: () => void; follow: () => void; tour: () => void };
export type LiveDraw = { pill: Pill | null; follow: boolean; tour: string | null; caption: string | null };

export function createLiveView(hooks: LiveHooks) {
  const $ = (id: string) => document.getElementById(id)!;
  const root = $("pl");
  const live = $("pl-live");
  const step = $("pl-live-step");
  const dots = $("pl-live-dots");
  const followBtn = $("pl-follow");
  const tourBtn = $("pl-tour");
  const caption = $("pl-caption");
  const press = (id: string, fn: () => void) => $(id).addEventListener("click", (e) => { (e.currentTarget as HTMLElement).blur(); fn(); });
  press("pl-take", hooks.takeOver);
  press("pl-follow", hooks.follow);
  press("pl-tour", hooks.tour);
  return {
    /** `pill` shows only while following; `follow` is the small button once taken over; `tour` is the Tour button's text (null: no tour); `caption` the current note. */
    draw(d: LiveDraw) {
      const on = d.pill !== null && d.pill.kind === "live";
      live.hidden = !on;
      root.classList.toggle("presenting", on);
      if (on) {
        step.textContent = d.pill!.text;
        dots.replaceChildren(...(d.pill!.dots ?? []).map((x) => {
          const e = document.createElement("span");
          e.className = `pl-dot ${x.state}`;
          return e;
        }));
      }
      followBtn.hidden = !d.follow;
      tourBtn.hidden = d.tour === null;
      if (d.tour !== null) tourBtn.textContent = d.tour;
      caption.hidden = d.caption === null;
      if (d.caption !== null) caption.textContent = d.caption;
    },
  };
}
