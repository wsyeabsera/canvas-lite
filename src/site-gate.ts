// Who may load the site's static files (docs/auth.md "The whole site"). Pure: the Worker asks, then serves, redirects or refuses.
// With a password set, a visitor without a valid session gets only the sign-in page and its script; everything else, the app and the docs
// included, redirects to it. Without one (token mode) the files are served to anyone, as before: the data is behind the token.

/** The two files an unauthenticated visitor may load: the sign-in page (public/login.html, served at /login) and its script. */
export const PUBLIC_FILES = ["/login", "/login-page.js"] as const;

export type SiteDecision = "serve" | "redirect-login" | "not-found";

export function siteDecision(method: string, pathname: string, passwordSet: boolean, authed: boolean): SiteDecision {
  if (method !== "GET" && method !== "HEAD") return "not-found";
  if (!passwordSet || authed || (PUBLIC_FILES as readonly string[]).includes(pathname)) return "serve";
  return "redirect-login";
}
