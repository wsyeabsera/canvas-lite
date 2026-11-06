// 3D scene model (docs/scenes.md): a scene is data only (objects, lights, sky, camera). Pure: validation and repeater expansion.
// No Claude-written code runs anywhere; the viewer draws this data.

export type Vec3 = [number, number, number];
export type Material = { color: string; roughness?: number; metalness?: number; emissive?: string; opacity?: number };
export type ObjectKind = "box" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "capsule" | "text" | "group" | "repeat" | "terrain";
export type Repeat = { mode: "grid" | "ring" | "scatter"; count: number; spacing?: number; radius?: number; seed?: number; of: SceneObject };
export type Terrain = { size: [number, number]; height: number; scale: number; octaves: number; seed: number };
export type SceneObject = {
  id: string; kind: ObjectKind; name?: string; pos?: Vec3; rot?: Vec3; scale?: Vec3; size?: number[]; material?: Material;
  text?: string; children?: SceneObject[]; repeat?: Repeat; terrain?: Terrain;
};
export type Light = { id: string; kind: "sun" | "ambient" | "point" | "spot"; color: string; intensity: number; pos?: Vec3; target?: Vec3 };
export type Sky = { top: string; bottom: string; fog?: { color: string; near: number; far: number } };
export type View = { pos: Vec3; look: Vec3 | string };
export type Scene = { name: string; objects: SceneObject[]; lights: Light[]; sky: Sky; camera: View & { fov: number } };

export const SCENE_OBJECTS_MAX = 2000;
export const SCENE_BYTES_MAX = 200_000;
export const SCENE_NESTING_MAX = 6;
export const SCENE_NAME_MAX = 80;
export const SCENE_NUMBER_MAX = 1_000_000;
const TEXT_MAX = 200;

/** `size` layout per kind (docs/scenes.md); kinds not listed take no size. */
export const SIZE_LAYOUT: Partial<Record<ObjectKind, string[]>> = {
  box: ["width", "height", "depth"], sphere: ["radius"], cylinder: ["radius", "height"], cone: ["radius", "height"],
  capsule: ["radius", "height"], torus: ["radius", "tube"], plane: ["width", "depth"], text: ["height"],
};

const KINDS = ["box", "sphere", "cylinder", "cone", "plane", "torus", "capsule", "text", "group", "repeat", "terrain"];
const LIGHT_KINDS = ["sun", "ambient", "point", "spot"];
const MODES = ["grid", "ring", "scatter"];
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (path: string, msg: string): never => {
  throw new Error(`invalid scene ${path}: ${msg}`);
};

function num(v: unknown, path: string, min = -SCENE_NUMBER_MAX, max = SCENE_NUMBER_MAX): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(path, `must be a finite number, got ${String(v)}`);
  if (v < min || v > max) return fail(path, `must be from ${min} to ${max}, got ${v}`);
  return v;
}
const int = (v: unknown, path: string, min: number, max: number) => {
  if (!Number.isInteger(v)) return fail(path, `must be an integer from ${min} to ${max}`);
  return num(v, path, min, max);
};
const unit = (v: unknown, path: string) => num(v, path, 0, 1);
function color(v: unknown, path: string): string {
  if (typeof v !== "string" || !COLOR_RE.test(v)) return fail(path, `must be a colour like #aabbcc, got ${JSON.stringify(v)}`);
  return v;
}
function slug(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length > 40 || !ID_RE.test(v)) return fail(path, `id ${JSON.stringify(v)} must be lowercase letters, digits and -, at most 40`);
  return v;
}
function vec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) return fail(path, "must be [x, y, z]");
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}
function text(v: unknown, path: string, max: number): string {
  if (typeof v !== "string" || v.length > max) return fail(path, `must be text of at most ${max} characters`);
  return v;
}

function checkMaterial(m: unknown, path: string): Material {
  if (!isObj(m)) return fail(path, "must be an object {color}");
  const out: Material = { color: color(m.color, `${path}.color`) };
  if (m.roughness !== undefined) out.roughness = unit(m.roughness, `${path}.roughness`);
  if (m.metalness !== undefined) out.metalness = unit(m.metalness, `${path}.metalness`);
  if (m.opacity !== undefined) out.opacity = unit(m.opacity, `${path}.opacity`);
  if (m.emissive !== undefined) out.emissive = color(m.emissive, `${path}.emissive`);
  return out;
}

function checkObject(o: unknown, path: string, depth: number, ids: Set<string>): SceneObject {
  if (depth > SCENE_NESTING_MAX) return fail(path, `nested deeper than ${SCENE_NESTING_MAX} levels`);
  if (!isObj(o)) return fail(path, "must be an object {id, kind}");
  const id = slug(o.id, `${path}.id`);
  if (ids.has(id)) return fail(`${path}.id`, `duplicate id "${id}"`);
  ids.add(id);
  if (typeof o.kind !== "string" || !KINDS.includes(o.kind)) return fail(`${path}.kind`, `must be one of ${KINDS.join(", ")}`);
  const kind = o.kind as ObjectKind;
  const out: SceneObject = { id, kind };
  if (o.name !== undefined) out.name = text(o.name, `${path}.name`, SCENE_NAME_MAX);
  if (o.pos !== undefined) out.pos = vec3(o.pos, `${path}.pos`);
  if (o.rot !== undefined) out.rot = vec3(o.rot, `${path}.rot`);
  if (o.scale !== undefined) out.scale = vec3(o.scale, `${path}.scale`);
  if (o.size !== undefined) {
    const layout = SIZE_LAYOUT[kind];
    if (!layout) return fail(`${path}.size`, `a ${kind} has no size`);
    if (!Array.isArray(o.size) || o.size.length !== layout.length) return fail(`${path}.size`, `a ${kind} size is [${layout.join(", ")}]`);
    out.size = o.size.map((n: unknown, i: number) => num(n, `${path}.size[${i}]`, 0));
  }
  if (o.material !== undefined) out.material = checkMaterial(o.material, `${path}.material`);
  if (kind === "text") {
    if (typeof o.text !== "string" || o.text === "") return fail(`${path}.text`, "a text object needs text");
    out.text = text(o.text, `${path}.text`, TEXT_MAX);
  } else if (o.text !== undefined) return fail(`${path}.text`, "only a text object has text");
  if (kind === "group") {
    if (!Array.isArray(o.children)) return fail(`${path}.children`, "a group needs children (a list, may be empty)");
    out.children = o.children.map((c: unknown, i: number) => checkObject(c, `${path}.children[${i}]`, depth + 1, ids));
  } else if (o.children !== undefined) return fail(`${path}.children`, "only a group has children");
  if (kind === "repeat") {
    const r = o.repeat;
    if (!isObj(r)) return fail(`${path}.repeat`, "a repeat object needs repeat {mode, count, of}");
    if (typeof r.mode !== "string" || !MODES.includes(r.mode)) return fail(`${path}.repeat.mode`, `must be one of ${MODES.join(", ")}`);
    const rep: Repeat = { mode: r.mode as Repeat["mode"], count: int(r.count, `${path}.repeat.count`, 1, 1_000_000), of: undefined as any };
    if (r.spacing !== undefined) rep.spacing = num(r.spacing, `${path}.repeat.spacing`, 0);
    if (r.radius !== undefined) rep.radius = num(r.radius, `${path}.repeat.radius`, 0);
    if (r.seed !== undefined) rep.seed = int(r.seed, `${path}.repeat.seed`, 0, 4_294_967_295);
    rep.of = checkObject(r.of, `${path}.repeat.of`, depth + 1, ids);
    out.repeat = rep;
  } else if (o.repeat !== undefined) return fail(`${path}.repeat`, "only a repeat object has repeat");
  if (kind === "terrain") {
    const t = o.terrain;
    if (!isObj(t)) return fail(`${path}.terrain`, "a terrain object needs terrain {size, height, scale, octaves, seed}");
    if (!Array.isArray(t.size) || t.size.length !== 2) return fail(`${path}.terrain.size`, "must be [width, depth]");
    out.terrain = {
      size: [num(t.size[0], `${path}.terrain.size[0]`, 0.001), num(t.size[1], `${path}.terrain.size[1]`, 0.001)],
      height: num(t.height, `${path}.terrain.height`, 0),
      scale: num(t.scale, `${path}.terrain.scale`, 0.000001),
      octaves: int(t.octaves, `${path}.terrain.octaves`, 1, 8),
      seed: int(t.seed, `${path}.terrain.seed`, 0, 4_294_967_295),
    };
  } else if (o.terrain !== undefined) return fail(`${path}.terrain`, "only a terrain object has terrain");
  return out;
}

/**
 * Nodes a node becomes once repeaters expand, counted arithmetically (nothing is expanded): a leaf or a group is one node (a group
 * plus its children), a repeater is replaced by count copies of its template. Every node expandObjects would create is counted.
 */
function countOf(o: SceneObject): number {
  if (o.kind === "group") return (o.children ?? []).reduce((t, c) => t + countOf(c), 1);
  if (o.kind === "repeat" && o.repeat) return o.repeat.count * countOf(o.repeat.of);
  return 1;
}

/** Pure: how many nodes (groups and repeater copies included) expandObjects returns for these objects, without expanding them. */
export const expandedCount = (objects: SceneObject[]): number => objects.reduce((t, o) => t + countOf(o), 0);

/** Largest |offset| per axis a repeater adds to its copies' pos (grid rows and columns, ring or scatter radius). */
function layoutReach(r: Repeat): Vec3 {
  if (r.mode === "grid") {
    const cols = Math.ceil(Math.sqrt(r.count));
    const s = r.spacing ?? 2;
    return [(Math.min(cols, r.count) - 1) * s, 0, (Math.ceil(r.count / cols) - 1) * s];
  }
  const rad = r.radius ?? (r.mode === "ring" ? 5 : 10);
  return [rad, 0, rad];
}

const absVec = (v: Vec3 | undefined): Vec3 => (v ? [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])] : [0, 0, 0]);

/**
 * Rejects any node whose expansion passes SCENE_OBJECTS_MAX (naming its id and the count) and any repeater whose copies' pos could
 * pass SCENE_NUMBER_MAX (a bound per axis: the repeater's own pos, which outer repeaters shift, plus its layout reach plus the
 * template pos). Arithmetic only; returns the total node count.
 */
function checkLimits(objects: SceneObject[], path: string): number {
  const visit = (n: SceneObject, p: string, reach: Vec3) => {
    const count = countOf(n);
    if (count > SCENE_OBJECTS_MAX)
      fail(p, `${n.kind === "repeat" ? "repeater" : n.kind} "${n.id}" expands to ${count} objects (limit ${SCENE_OBJECTS_MAX})`);
    if (n.kind === "group") (n.children ?? []).forEach((c, j) => visit(c, `${p}.children[${j}]`, absVec(c.pos)));
    else if (n.kind === "repeat" && n.repeat) {
      const lay = layoutReach(n.repeat);
      const tpl = absVec(n.repeat.of.pos);
      const copies: Vec3 = [reach[0] + lay[0] + tpl[0], reach[1] + lay[1] + tpl[1], reach[2] + lay[2] + tpl[2]];
      const far = Math.max(...copies);
      if (far > SCENE_NUMBER_MAX) fail(p, `repeater "${n.id}" places copies up to ${far} from the origin (limit ${SCENE_NUMBER_MAX})`);
      visit(n.repeat.of, `${p}.repeat.of`, copies);
    }
  };
  objects.forEach((o, i) => visit(o, `${path}[${i}]`, absVec(o.pos)));
  return expandedCount(objects);
}

/** Pure: input -> a validated copy. Throws `invalid scene <path>: ...` naming the path of the first bad value. */
export function checkScene(input: unknown): Scene {
  if (!isObj(input)) return fail("", "must be an object {name, objects, lights, sky, camera}");
  const bytes = new TextEncoder().encode(JSON.stringify(input) ?? "").length;
  if (bytes > SCENE_BYTES_MAX) return fail("", `is ${bytes} bytes, limit ${SCENE_BYTES_MAX}`);
  if (typeof input.name !== "string" || input.name.trim() === "" || input.name.length > SCENE_NAME_MAX)
    return fail("name", `must be 1 to ${SCENE_NAME_MAX} characters`);
  if (!Array.isArray(input.objects)) return fail("objects", "must be a list (may be empty)");
  const ids = new Set<string>();
  const objects = input.objects.map((o: unknown, i: number) => checkObject(o, `objects[${i}]`, 1, ids));
  const total = checkLimits(objects, "objects");
  if (total > SCENE_OBJECTS_MAX) return fail("objects", `expands to ${total} objects (limit ${SCENE_OBJECTS_MAX})`);

  if (!Array.isArray(input.lights)) return fail("lights", "must be a list (may be empty)");
  const lightIds = new Set<string>();
  const lights = input.lights.map((l: unknown, i: number): Light => {
    const p = `lights[${i}]`;
    if (!isObj(l)) return fail(p, "must be an object {id, kind, color, intensity}");
    const id = slug(l.id, `${p}.id`);
    if (lightIds.has(id)) return fail(`${p}.id`, `duplicate id "${id}"`);
    lightIds.add(id);
    if (typeof l.kind !== "string" || !LIGHT_KINDS.includes(l.kind)) return fail(`${p}.kind`, `must be one of ${LIGHT_KINDS.join(", ")}`);
    const out: Light = { id, kind: l.kind as Light["kind"], color: color(l.color, `${p}.color`), intensity: num(l.intensity, `${p}.intensity`, 0) };
    if (l.pos !== undefined) out.pos = vec3(l.pos, `${p}.pos`);
    if (l.target !== undefined) out.target = vec3(l.target, `${p}.target`);
    return out;
  });

  const s = input.sky;
  if (!isObj(s)) return fail("sky", "must be an object {top, bottom}");
  const sky: Sky = { top: color(s.top, "sky.top"), bottom: color(s.bottom, "sky.bottom") };
  if (s.fog !== undefined) {
    if (!isObj(s.fog)) return fail("sky.fog", "must be an object {color, near, far}");
    sky.fog = { color: color(s.fog.color, "sky.fog.color"), near: num(s.fog.near, "sky.fog.near", 0), far: num(s.fog.far, "sky.fog.far", 0) };
    if (sky.fog.far <= sky.fog.near) return fail("sky.fog.far", "must be greater than near");
  }

  const c = input.camera;
  if (!isObj(c)) return fail("camera", "must be an object {pos, look, fov}");
  const look = typeof c.look === "string" ? slug(c.look, "camera.look") : vec3(c.look, "camera.look");
  if (typeof look === "string" && !ids.has(look)) return fail("camera.look", `unknown object id "${look}"`);
  const camera = { pos: vec3(c.pos, "camera.pos"), look, fov: num(c.fov, "camera.fov", 10, 120) };

  return { name: input.name, objects, lights, sky, camera };
}

/** Pure: every declared object id (nested and repeater templates included), not the expanded copies. */
export function objectIds(scene: Scene): Set<string> {
  const ids = new Set<string>();
  const walk = (o: SceneObject) => {
    ids.add(o.id);
    (o.children ?? []).forEach(walk);
    if (o.repeat) walk(o.repeat.of);
  };
  scene.objects.forEach(walk);
  return ids;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Appends tag to the id of o and of everything under it (children and a nested repeater's template), so nested copies stay unique. */
const suffix = (o: SceneObject, tag: string): SceneObject => ({
  ...o,
  id: `${o.id}${tag}`,
  ...(o.children && { children: o.children.map((c) => suffix(c, tag)) }),
  ...(o.repeat && { repeat: { ...o.repeat, of: suffix(o.repeat.of, tag) } }),
});

/**
 * Pure: the scene tree with every repeater replaced by its copies (in place, as siblings). Copies are `<id>#<n>` (children of a copied
 * group get the same suffix); a repeater inside a repeater appends one `#<n>` per level, outermost first (`c#1#0` = inner copy 0 of
 * outer copy 1), so every expanded id is unique and deterministic. Copies sit at repeat.pos + the layout offset + template.pos.
 * Groups stay as nodes: their transforms are left to the renderer. Refuses (throws, before allocating) input that would expand past
 * SCENE_OBJECTS_MAX nodes, so it is safe on unchecked trees too; checkScene rejects such scenes first with the path.
 */
export function expandObjects(objects: SceneObject[]): SceneObject[] {
  const total = expandedCount(objects);
  if (total > SCENE_OBJECTS_MAX) throw new Error(`invalid scene objects: expands to ${total} objects (limit ${SCENE_OBJECTS_MAX})`);
  return expandTree(objects);
}

function expandTree(objects: SceneObject[]): SceneObject[] {
  return objects.flatMap((o): SceneObject[] => {
    if (o.kind === "group") return [{ ...o, children: expandTree(o.children ?? []) }];
    if (o.kind !== "repeat" || !o.repeat) return [o];
    const r = o.repeat;
    const base = o.pos ?? [0, 0, 0];
    const rand = mulberry32(r.seed ?? 0);
    const cols = Math.ceil(Math.sqrt(r.count));
    const spacing = r.spacing ?? 2;
    const out: SceneObject[] = [];
    for (let n = 0; n < r.count; n++) {
      let off: Vec3;
      if (r.mode === "grid") off = [(n % cols) * spacing, 0, Math.floor(n / cols) * spacing];
      else if (r.mode === "ring") {
        const a = (2 * Math.PI * n) / r.count;
        const rad = r.radius ?? 5;
        off = [Math.cos(a) * rad, 0, Math.sin(a) * rad];
      } else {
        const a = rand() * 2 * Math.PI;
        const d = Math.sqrt(rand()) * (r.radius ?? 10);
        off = [Math.cos(a) * d, 0, Math.sin(a) * d];
      }
      const tpl = r.of.pos ?? [0, 0, 0];
      const copy = suffix({ ...r.of, pos: [base[0] + off[0] + tpl[0], base[1] + off[1] + tpl[1], base[2] + off[2] + tpl[2]] }, `#${n}`);
      out.push(...expandTree([copy]));
    }
    return out;
  });
}
