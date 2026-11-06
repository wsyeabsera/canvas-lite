// Theme: dark, light, or auto (follows the system). The pure helpers are unit-tested; initTheme only wires them to the DOM.
export type ThemePref = "auto" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "lite.theme";
const ORDER: ThemePref[] = ["auto", "light", "dark"];

/** Anything that is not a known choice means auto. */
export function parsePref(raw: unknown): ThemePref {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

/** The click order: auto, light, dark, auto. */
export function nextPref(pref: ThemePref): ThemePref {
  return ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;
}

/** The theme actually shown: auto follows the system. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  if (pref === "auto") return systemDark ? "dark" : "light";
  return pref;
}

export function buttonLabel(pref: ThemePref): string {
  return `Theme: ${pref}`;
}

// Minimal DOM shapes, so this file also typechecks in the unit tests (no "dom" lib there).
interface ThemeButton {
  textContent: string | null;
  title: string;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", fn: () => void): void;
}
interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}
interface SystemQuery {
  matches: boolean;
  addEventListener(type: "change", fn: () => void): void;
}
const dom = globalThis as unknown as { document?: { documentElement: ThemeRoot }; localStorage: { getItem(k: string): string | null; setItem(k: string, v: string): void }; matchMedia?: (q: string) => SystemQuery };

/** Wires the theme button: applies the saved choice to `root` (data-theme) and cycles it on click. */
export function initTheme(button: ThemeButton, root: ThemeRoot = dom.document!.documentElement): void {
  let pref: ThemePref = "auto";
  try {
    pref = parsePref(dom.localStorage.getItem(KEY));
  } catch {
    /* storage can be blocked: the choice then lasts for this tab only */
  }
  let mql: SystemQuery | undefined;
  try {
    mql = dom.matchMedia!("(prefers-color-scheme: dark)");
  } catch {
    /* no matchMedia: treat the system as dark, the default palette */
  }
  const apply = () => {
    root.dataset.theme = resolveTheme(pref, mql ? mql.matches : true);
    const label = buttonLabel(pref);
    button.textContent = label;
    button.setAttribute("aria-label", `${label} (click to change)`);
    button.title = label;
  };
  mql?.addEventListener("change", apply);
  button.addEventListener("click", () => {
    pref = nextPref(pref);
    try {
      dom.localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    apply();
  });
  apply();
}
