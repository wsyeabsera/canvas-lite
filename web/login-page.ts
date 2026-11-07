// The standalone sign-in page (public/login.html at /login, docs/auth.md): the only script an unauthenticated visitor loads, bundled on its own.
// On success it goes to the app, keeping the fragment (a `#token=` link still works after signing in).
import { mountLogin } from "./login-view.ts";

mountLogin(document.getElementById("login") as HTMLFormElement, () => location.replace(`/${location.hash}`));
