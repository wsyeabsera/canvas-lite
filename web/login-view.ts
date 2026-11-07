// DOM wiring of the login form inside the locked screen (docs/auth.md). Posts the password to /login, never stores it, and reloads on success
// so every request and the websocket start with the session cookie.
import { loginFailure } from "./login.ts";

export function mountLogin(form: HTMLFormElement, onDone: () => void): void {
  const input = form.querySelector<HTMLInputElement>("input")!;
  const button = form.querySelector<HTMLButtonElement>("button")!;
  const msg = form.querySelector<HTMLElement>(".lg-msg")!;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!input.value) return;
    button.disabled = true;
    msg.textContent = "";
    try {
      const res = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: input.value }) });
      if (res.ok) return onDone();
      msg.textContent = loginFailure(res.status, await res.json().catch(() => null));
      input.setAttribute("aria-invalid", "true");
      input.select();
    } catch {
      msg.textContent = loginFailure(0, null);
    } finally {
      button.disabled = false;
    }
  });
}
