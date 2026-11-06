// Theme: dark, light, or auto (follows the system). Stub: the glass-shell task (#1943) replaces the body, keeping these exports.
export type ThemePref = "auto" | "light" | "dark";

/** Wires the theme button: applies the saved choice to `root` (data-theme) and cycles it on click. */
export function initTheme(_button: HTMLElement, _root: HTMLElement = document.documentElement): void {}
