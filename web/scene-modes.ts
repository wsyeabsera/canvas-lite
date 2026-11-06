// The modes of a 3D scene (docs/ui.md "Scenes"): the segmented switch in the scene's glass top chip is drawn from SCENE_MODES, so a new
// mode is one entry here (plus its route in web/state.ts). Pure, no DOM; web/scene-view.ts renders it (modeSwitch), unit tested in test/scene-watch.test.ts.
import { hrefScene, hrefSceneWatch } from "./state.ts";

export type SceneMode = "orbit" | "watch";
export type SceneModeDef = { mode: SceneMode; label: string; href: (project: string, scene: string) => string };

/** In order, left to right. To add a mode: extend SceneMode and append `{ mode, label, href }` here. */
export const SCENE_MODES: readonly SceneModeDef[] = [
  { mode: "orbit", label: "Orbit", href: hrefScene },
  { mode: "watch", label: "Watch", href: (p, s) => hrefSceneWatch(p, s) },
];

/** The segments to draw: label, link and whether it is the mode on show. */
export const modeSegments = (current: SceneMode, project: string, scene: string): { mode: SceneMode; label: string; href: string; current: boolean }[] =>
  SCENE_MODES.map((m) => ({ mode: m.mode, label: m.label, href: m.href(project, scene), current: m.mode === current }));
