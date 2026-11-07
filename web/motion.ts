// Motion for the variants views, from the transitions.dev scale (the tokens are the `--modal-*` and `--stagger-*` variables in public/index.html).
// Modal: scale up from centre on open, a softer scale down on close, then the native dialog closes. Rise: a staggered blurred rise for a list.
const ms = (name: string, fallback: number) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;

/** Opens a native dialog and plays the modal entrance. Esc and the backdrop close it with the exit transition too. */
export function openModal(d: HTMLDialogElement): void {
  d.classList.add("t-modal");
  d.classList.remove("is-closing");
  if (!d.open) d.showModal();
  void d.offsetWidth; // the reflow that makes the transition play from the resting scale
  d.classList.add("is-open");
  if (!d.dataset.motion) {
    d.dataset.motion = "1";
    d.addEventListener("cancel", (ev) => {
      ev.preventDefault();
      closeModal(d);
    });
  }
}

export function closeModal(d: HTMLDialogElement): void {
  if (!d.open) return;
  d.classList.remove("is-open");
  d.classList.add("is-closing");
  setTimeout(() => {
    d.classList.remove("is-closing");
    if (d.open) d.close();
  }, ms("--modal-close-dur", 150));
}

/** Plays the staggered rise on the given elements (one beat apart, capped at eight beats so a long list is not slow). */
export function rise(items: HTMLElement[]): void {
  const beat = ms("--stagger-stagger", 40);
  items.forEach((e, i) => {
    e.classList.add("t-rise");
    e.style.transitionDelay = `${Math.min(i, 8) * beat}ms`;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => items.forEach((e) => e.classList.add("is-shown"))));
}
