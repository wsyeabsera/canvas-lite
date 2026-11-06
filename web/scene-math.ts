// Pure helpers for the 3D scene renderer (web/scene-render.ts) and Orbit mode (web/scene-view.ts): colours, default sizes,
// procedural terrain noise, and orbit camera math. No DOM, no WebGL, no Three.js; unit tested in test/scene-math.test.ts.
import type { ObjectKind, SceneObject, Terrain, Vec3 } from "../src/scene.ts";

// --- colours -------------------------------------------------------------

/** "#rrggbb" -> [r, g, b] in 0..1. Anything unreadable is mid grey (the data is checked upstream; this never throws). */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** "#rrggbb" -> 0xrrggbb (grey 0x808080 when unreadable). */
export function hexToInt(hex: string): number {
  return /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x808080;
}

/** Linear mix of two #rrggbb colours at t (0..1), as [r, g, b] in 0..1. */
export function mixRgb(a: string, b: string, t: number): [number, number, number] {
  const x = parseHex(a), y = parseHex(b);
  const k = Math.min(1, Math.max(0, t));
  return [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
}

/** Sky gradient colour for a direction's height y (-1 below the horizon .. 1 straight up): `bottom` at and below the horizon, easing to `top`. */
export function skyAt(top: string, bottom: string, y: number): [number, number, number] {
  return mixRgb(bottom, top, Math.pow(Math.max(0, y), 0.6));
}

// --- objects ---------------------------------------------------------------

/** Kinds drawn as one mesh from `size` (text, terrain, group and repeat are drawn otherwise). */
export const PRIMITIVES: readonly ObjectKind[] = ["box", "sphere", "cylinder", "cone", "plane", "torus", "capsule"];

/** `size` with the documented defaults filled in (docs/scenes.md): 1 everywhere, cylinder/cone/capsule height 2, torus tube 0.3. */
export function fullSize(kind: ObjectKind, size?: number[]): number[] {
  const d: Partial<Record<ObjectKind, number[]>> = {
    box: [1, 1, 1], sphere: [1], cylinder: [1, 2], cone: [1, 2], capsule: [1, 2], torus: [1, 0.3], plane: [1, 1], text: [1],
  };
  const def = d[kind] ?? [];
  return def.map((v, i) => (size && typeof size[i] === "number" && Number.isFinite(size[i]) ? size[i] : v));
}

/** True when every copy of this repeater can be one instanced mesh: its template is a single primitive (no children). */
export const instanceable = (o: SceneObject): boolean => o.kind === "repeat" && !!o.repeat && PRIMITIVES.includes(o.repeat.of.kind);

/** Degrees -> radians, per axis. */
export const toRadians = (v: Vec3 | undefined): Vec3 => (v ? [(v[0] * Math.PI) / 180, (v[1] * Math.PI) / 180, (v[2] * Math.PI) / 180] : [0, 0, 0]);

// --- terrain noise ---------------------------------------------------------

/** Deterministic hash of an integer lattice point and a seed -> 0..1. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in 0..1 at (x, z); the same inputs always give the same value. */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fz;
}

/** Fractal noise: `octaves` layers of value noise, each twice the frequency and half the weight; normalised to 0..1. */
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  const n = Math.max(1, Math.min(8, Math.floor(octaves)));
  for (let o = 0; o < n; o++) {
    sum += amp * valueNoise(x * f, z * f, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/** Terrain height at local (x, z): `height` times the fractal noise, where `scale` is the size of the largest features in world units. */
export const terrainHeight = (t: Terrain, x: number, z: number): number => t.height * fbm(x / t.scale, z / t.scale, t.octaves, t.seed);

/** Grid resolution for a terrain: about one vertex per world unit, from 16 to 128 segments per side. */
export const terrainSegments = (t: Terrain): [number, number] => [
  Math.max(16, Math.min(128, Math.ceil(t.size[0]))),
  Math.max(16, Math.min(128, Math.ceil(t.size[1]))),
];

/**
 * Heights for a (segX+1) x (segZ+1) vertex grid centred on the origin, row by row from z = -depth/2 to +depth/2 and in each row
 * x from -width/2 to +width/2: the vertex order of a Three.js PlaneGeometry after rotateX(-90 degrees).
 */
export function terrainGrid(t: Terrain, segX: number, segZ: number): Float32Array {
  const [w, d] = t.size;
  const out = new Float32Array((segX + 1) * (segZ + 1));
  let i = 0;
  for (let iz = 0; iz <= segZ; iz++) {
    const z = -d / 2 + (iz * d) / segZ;
    for (let ix = 0; ix <= segX; ix++) out[i++] = terrainHeight(t, -w / 2 + (ix * w) / segX, z);
  }
  return out;
}

// --- camera and orbit --------------------------------------------------------

/** An orbit camera: a target, a distance, an azimuth `theta` around +Y (0 looks from +Z) and a polar angle `phi` from +Y. */
export type Orbit = { target: Vec3; radius: number; theta: number; phi: number };

export const ORBIT_MIN_RADIUS = 0.5;
export const ORBIT_MAX_RADIUS = 20_000;
const PHI_MIN = 0.05;
const PHI_MAX = Math.PI - 0.05;
/** Dragging never takes the camera below the target's level (looking up from under the ground); a camera set lower stays where it is. */
export const ORBIT_PHI_DRAG_MAX = Math.PI / 2 - 0.02;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The orbit that puts the camera at `pos` looking at `target`. */
export function toOrbit(pos: Vec3, target: Vec3): Orbit {
  const dx = pos[0] - target[0], dy = pos[1] - target[1], dz = pos[2] - target[2];
  const r = Math.hypot(dx, dy, dz);
  if (r < 1e-9) return { target: [...target], radius: ORBIT_MIN_RADIUS, theta: 0, phi: Math.PI / 2 };
  return { target: [...target], radius: clamp(r, ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS), theta: Math.atan2(dx, dz), phi: clamp(Math.acos(clamp(dy / r, -1, 1)), PHI_MIN, PHI_MAX) };
}

/** The camera position of an orbit. */
export function fromOrbit(o: Orbit): Vec3 {
  const s = Math.sin(o.phi);
  return [o.target[0] + o.radius * s * Math.sin(o.theta), o.target[1] + o.radius * Math.cos(o.phi), o.target[2] + o.radius * s * Math.cos(o.theta)];
}

/**
 * Drag to rotate: dx, dy in CSS pixels. Dragging right swings the camera left around the target; dragging down raises it.
 * phi stays off the top pole and, by dragging, not below the target's level (ORBIT_PHI_DRAG_MAX, or the current phi if lower).
 */
export function orbitRotate(o: Orbit, dx: number, dy: number, speed = 0.005): Orbit {
  return { ...o, theta: o.theta - dx * speed, phi: clamp(o.phi - dy * speed, PHI_MIN, Math.max(ORBIT_PHI_DRAG_MAX, o.phi)) };
}

/** Wheel to zoom: a positive deltaY moves away; the distance changes by a factor, so zooming feels the same near and far. */
export function orbitZoom(o: Orbit, deltaY: number, speed = 0.0015): Orbit {
  return { ...o, radius: clamp(o.radius * Math.exp(deltaY * speed), ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS) };
}

/** The camera's right and up vectors for an orbit (unit length). */
export function orbitAxes(o: Orbit): { right: Vec3; up: Vec3 } {
  const cp = Math.cos(o.phi), sp = Math.sin(o.phi), ct = Math.cos(o.theta), st = Math.sin(o.theta);
  return { right: [ct, 0, -st], up: [-cp * st, sp, -cp * ct] };
}

/**
 * Shift- or right-drag to pan: the target slides in the view plane so the point under the pointer stays under it.
 * `fov` is the vertical field of view in degrees, `viewportHeight` the canvas height in CSS pixels.
 */
export function orbitPan(o: Orbit, dx: number, dy: number, fov: number, viewportHeight: number): Orbit {
  const perPx = (2 * o.radius * Math.tan((fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
  const { right, up } = orbitAxes(o);
  const mx = -dx * perPx, my = dy * perPx;
  return { ...o, target: [o.target[0] + right[0] * mx + up[0] * my, o.target[1] + right[1] * mx + up[1] * my, o.target[2] + right[2] * mx + up[2] * my] };
}

/** Far clipping distance for a scene whose objects reach `extent` units from the origin and whose camera starts `camDist` away. */
export const farFor = (extent: number, camDist: number): number => Math.max(1000, (extent + camDist) * 4);

/** Whether the render loop may draw a frame now: something changed, the view is not paused and the tab is visible. */
export const shouldDraw = (s: { dirty: boolean; paused: boolean; hidden: boolean }): boolean => s.dirty && !s.paused && !s.hidden;

// --- projection (Watch mode's focus ring) --------------------------------------
// The renderer's camera is a Three.js PerspectiveCamera turned with lookAt and world up +Y, so these match what it draws.

/** A camera as SceneView.camera() reports it: position, look-at point and vertical fov in degrees. */
export type CameraState = { pos: Vec3; look: Vec3; fov: number };
/** A rectangle in CSS pixels of the viewport (x, y top-left). */
export type ScreenBox = { x: number; y: number; w: number; h: number };

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };

/** The camera's unit forward, right and up vectors (world up +Y; looking straight up or down uses +X as right). */
export function cameraBasis(pos: Vec3, look: Vec3): { forward: Vec3; right: Vec3; up: Vec3 } {
  let forward = norm3(sub3(look, pos));
  if (forward[0] === 0 && forward[1] === 0 && forward[2] === 0) forward = [0, 0, -1];
  let right = norm3(cross3(forward, [0, 1, 0]));
  if (right[0] === 0 && right[1] === 0 && right[2] === 0) right = [1, 0, 0];
  return { forward, right, up: cross3(right, forward) };
}

/** A world point in normalised device coordinates (x right, y up, -1..1 inside the view) and its depth along the view direction (negative: behind the camera). */
export function projectPoint(cam: CameraState, aspect: number, p: Vec3): { x: number; y: number; depth: number } {
  const { forward, right, up } = cameraBasis(cam.pos, cam.look);
  const d = sub3(p, cam.pos);
  const depth = dot3(d, forward);
  const f = Math.tan((cam.fov * Math.PI) / 360);
  const z = Math.max(1e-6, Math.abs(depth));
  return { x: dot3(d, right) / (z * f * Math.max(1e-6, aspect)), y: dot3(d, up) / (z * f), depth };
}

/** The 8 corners of an axis-aligned box. */
export const boxCorners = (min: Vec3, max: Vec3): Vec3[] => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);

/**
 * The screen rectangle around a world box (its corners projected; corners behind the near plane are left out), grown by `pad` px and clipped to the
 * width x height viewport. Null when the box is wholly behind the camera or off screen.
 */
export function screenBox(cam: CameraState, width: number, height: number, min: Vec3, max: Vec3, pad = 0, near = 0.1): ScreenBox | null {
  if (!(width > 0) || !(height > 0)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of boxCorners(min, max)) {
    const p = projectPoint(cam, width / height, c);
    if (p.depth < near) continue;
    const sx = ((p.x + 1) / 2) * width, sy = ((1 - p.y) / 2) * height;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (!Number.isFinite(x0)) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(width, x1 + pad); y1 = Math.min(height, y1 + pad);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
