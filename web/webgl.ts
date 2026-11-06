// WebGL 2 check for the 3D views, kept out of web/scene-render.ts so a page can decide before downloading Three.js.
// Setting local storage `lite.scene.nowebgl` to "1" forces it to fail (to see the fallback message and poster by hand).

export const NO_WEBGL_KEY = "lite.scene.nowebgl";

/** True when the browser can make a WebGL 2 context (Three.js needs it) and the fallback is not forced. */
export function hasWebGL2(): boolean {
  try {
    if (localStorage.getItem(NO_WEBGL_KEY) === "1") return false;
  } catch {
    /* storage blocked: no override */
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    (gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
    return !!gl;
  } catch {
    return false;
  }
}
