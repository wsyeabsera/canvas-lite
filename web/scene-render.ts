// The 3D scene renderer (docs/scenes.md "Renderer"): draws a checked Scene with Three.js (MIT, bundled; no eval, no remote code).
// Loaded only with import() from web/scene-view.ts, so page.js never carries Three.js. DOM and GL only; the maths it relies on
// is pure and unit tested in web/scene-math.ts. Verified by hand once in Chrome.
import {
  ACESFilmicToneMapping, AmbientLight, BackSide, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, FrontSide, Euler, Fog, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion, Scene as ThreeScene,
  SphereGeometry, SpotLight, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector3, WebGLRenderer, type Material as ThreeMaterial,
} from "three";
import { expandObjects, type Material, type Scene, type SceneObject, type Vec3, type View } from "../src/scene.ts";
import { farFor, fullSize, hexToInt, instanceable, shouldDraw, skyAt, terrainGrid, terrainSegments, toRadians } from "./scene-math.ts";

/** A camera for setCamera: a position, a look-at point or object id, and optionally a new vertical field of view (degrees). */
export type CameraView = View & { fov?: number };

export interface SceneView {
  /** The <canvas> the view draws into (already appended to the container). */
  readonly canvas: HTMLCanvasElement;
  /** Moves the camera (a string `look` is an object id: the centre of its bounds) and schedules one frame. */
  setCamera(view: CameraView): void;
  /** The camera as last set: position, resolved look-at point and fov. */
  camera(): { pos: Vec3; look: Vec3; fov: number };
  /** The world-space point a look (a point or an object id) resolves to; an unknown id gives the scene centre. */
  lookPoint(look: Vec3 | string): Vec3;
  /** Schedules one frame (drawn on the next animation frame, unless paused or the tab is hidden). */
  render(): void;
  /** Re-reads the container size and schedules a frame. Also runs by itself on container resize. */
  resize(): void;
  /** Stops drawing (no frames at all) until resume(). */
  pause(): void;
  /** Allows drawing again and draws one frame if anything changed meanwhile. */
  resume(): void;
  /** Draws one frame now and returns it as a JPEG data URL (a still poster or thumbnail). */
  poster(): string;
  /** Frees the GPU resources and removes the canvas. The view is unusable afterwards. */
  dispose(): void;
}

const DEFAULT_MATERIAL: Material = { color: "#cccccc" };
const POINT_GAIN = 12; // point and spot intensity 1 lights about 10 units around (decay 1)

/** Builds the view. Throws when WebGL 2 is not available (check hasWebGL2() from web/webgl.ts first, before loading this chunk). */
export function createSceneView(container: HTMLElement, scene: Scene): SceneView {
  const canvas = document.createElement("canvas");
  canvas.className = "sc-gl";
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.append(canvas);

  const world = new ThreeScene();
  const disposables: { dispose(): void }[] = [];
  const geoCache = new Map<string, BufferGeometry>();
  const matCache = new Map<string, ThreeMaterial>();
  const byId = new Map<string, Object3D>();

  const geometry = (o: SceneObject): BufferGeometry => {
    const s = fullSize(o.kind, o.size);
    const key = `${o.kind}:${s.join(",")}`;
    let g = geoCache.get(key);
    if (g) return g;
    switch (o.kind) {
      case "box": g = new BoxGeometry(s[0], s[1], s[2]); break;
      case "sphere": g = new SphereGeometry(s[0], 32, 16); break;
      case "cylinder": g = new CylinderGeometry(s[0], s[0], s[1], 32); break;
      case "cone": g = new ConeGeometry(s[0], s[1], 32); break;
      case "capsule": g = new CapsuleGeometry(s[0], Math.max(0, s[1] - 2 * s[0]), 8, 16); break; // height is the whole capsule
      case "torus": g = new TorusGeometry(s[0], s[1], 16, 48); break;
      default: g = new PlaneGeometry(s[0], s[1]); // plane: in the XY plane; rot [-90, 0, 0] lays it flat
    }
    geoCache.set(key, g);
    disposables.push(g);
    return g;
  };

  const material = (m: Material | undefined, flat: boolean): ThreeMaterial => {
    const mm = m ?? DEFAULT_MATERIAL;
    const key = JSON.stringify([mm.color, mm.roughness, mm.metalness, mm.emissive, mm.opacity, flat]);
    let out = matCache.get(key);
    if (out) return out;
    const opacity = mm.opacity ?? 1;
    out = new MeshStandardMaterial({
      color: hexToInt(mm.color), roughness: mm.roughness ?? 0.8, metalness: mm.metalness ?? 0,
      emissive: mm.emissive ? hexToInt(mm.emissive) : 0x000000, opacity, transparent: opacity < 1, side: flat ? DoubleSide : FrontSide,
    });
    matCache.set(key, out);
    disposables.push(out);
    return out;
  };

  const place = (obj: Object3D, o: SceneObject) => {
    if (o.pos) obj.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) obj.rotation.set(...toRadians(o.rot), "XYZ");
    if (o.scale) obj.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  };

  const shadows = (m: Mesh, o: SceneObject) => {
    const transparent = (o.material?.opacity ?? 1) < 1;
    m.castShadow = !transparent && o.kind !== "plane";
    m.receiveShadow = true;
  };

  const textSprite = (o: SceneObject): Sprite => {
    const text = o.text ?? "";
    const px = 96;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const font = `600 ${px}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + px;
    c.width = Math.min(4096, w);
    c.height = Math.round(px * 1.5);
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = px / 8;
    ctx.fillStyle = o.material?.color ?? "#ffffff";
    ctx.fillText(text, c.width / 2, c.height / 2);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    const mat = new SpriteMaterial({ map: tex, transparent: true, opacity: o.material?.opacity ?? 1, depthWrite: false });
    disposables.push(tex, mat);
    const sprite = new Sprite(mat);
    const h = fullSize("text", o.size)[0] * 1.5; // the canvas is 1.5 letter heights tall
    sprite.scale.set((h * c.width) / c.height, h, 1);
    return sprite;
  };

  const terrainMesh = (o: SceneObject): Mesh => {
    const t = o.terrain!;
    const [sx, sz] = terrainSegments(t);
    const g = new PlaneGeometry(t.size[0], t.size[1], sx, sz);
    g.rotateX(-Math.PI / 2);
    const heights = terrainGrid(t, sx, sz);
    const p = g.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, heights[i]);
    p.needsUpdate = true;
    g.computeVertexNormals();
    disposables.push(g);
    const m = new Mesh(g, material(o.material ?? { color: "#6b8f5a", roughness: 1 }, false));
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  };

  /** One instanced mesh for every copy of a repeater whose template is a single primitive. */
  const instanced = (o: SceneObject): Object3D => {
    const copies = expandObjects([o]);
    const tpl = o.repeat!.of;
    const mesh = new InstancedMesh(geometry(tpl), material(tpl.material, tpl.kind === "plane"), copies.length);
    const q = new Quaternion().setFromEuler(new Euler(...toRadians(tpl.rot), "XYZ"));
    const s = new Vector3(...(tpl.scale ?? [1, 1, 1]));
    const m4 = new Matrix4();
    const base = new Vector3(...(o.pos ?? [0, 0, 0]));
    copies.forEach((c, i) => mesh.setMatrixAt(i, m4.compose(new Vector3(...(c.pos ?? [0, 0, 0])).sub(base), q, s)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    shadows(mesh, tpl);
    const holder = new Group(); // the repeater's own pos, rot and scale wrap its copies (copies are relative to its pos)
    place(holder, o);
    holder.add(mesh);
    byId.set(tpl.id, holder);
    return holder;
  };

  /** Builds one node of the declared tree; repeaters expand here (expandObjects) so their copies keep group transforms. */
  const build = (o: SceneObject): Object3D => {
    let obj: Object3D;
    if (o.kind === "group") {
      obj = new Group();
      for (const c of o.children ?? []) obj.add(build(c));
      place(obj, o);
    } else if (o.kind === "repeat" && o.repeat) {
      if (instanceable(o)) obj = instanced(o);
      else {
        obj = new Group(); // expandObjects places copies at the repeater's pos; the holder sits there instead and turns them
        const base = new Vector3(...(o.pos ?? [0, 0, 0]));
        for (const c of expandObjects([o])) {
          const child = build(c);
          child.position.sub(base);
          obj.add(child);
        }
        place(obj, o);
        if (!byId.has(o.repeat.of.id)) byId.set(o.repeat.of.id, obj);
      }
    } else if (o.kind === "text") {
      obj = textSprite(o);
      place(obj, o);
    } else if (o.kind === "terrain" && o.terrain) {
      obj = terrainMesh(o);
      place(obj, o);
    } else {
      const m = new Mesh(geometry(o), material(o.material, o.kind === "plane"));
      shadows(m, o);
      obj = m;
      place(obj, o);
    }
    obj.name = o.id;
    if (!byId.has(o.id)) byId.set(o.id, obj); // expanded copies (tower#3) are not declared ids; the first one wins
    return obj;
  };

  const content = new Group();
  for (const o of scene.objects) content.add(build(o));
  world.add(content);
  content.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(content);
  const center = bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3());
  const radius = bounds.isEmpty() ? 10 : Math.max(1, bounds.getSize(new Vector3()).length() / 2);

  // --- lights -----------------------------------------------------------------
  for (const l of scene.lights) {
    const color = new Color(hexToInt(l.color));
    if (l.kind === "ambient") world.add(new AmbientLight(color, l.intensity));
    else if (l.kind === "sun") {
      const sun = new DirectionalLight(color, l.intensity);
      const target = new Vector3(...(l.target ?? [center.x, center.y, center.z]));
      const dir = new Vector3(...(l.pos ?? [10, 20, 10])).sub(target).normalize();
      // the shadow camera covers the scene's bounding sphere, seen from the sun's direction
      sun.position.copy(center).addScaledVector(dir, radius * 2);
      sun.target.position.copy(center);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const cam = sun.shadow.camera;
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.near = 0.1; cam.far = radius * 4;
      cam.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      sun.shadow.radius = 4;
      world.add(sun, sun.target);
    } else if (l.kind === "point") {
      const p = new PointLight(color, l.intensity * POINT_GAIN, 0, 1);
      p.position.set(...(l.pos ?? [0, 5, 0]));
      world.add(p);
    } else {
      const s = new SpotLight(color, l.intensity * POINT_GAIN, 0, Math.PI / 6, 0.5, 1);
      s.position.set(...(l.pos ?? [0, 10, 0]));
      s.target.position.set(...(l.target ?? [0, 0, 0]));
      world.add(s, s.target);
    }
  }

  // --- sky and fog --------------------------------------------------------------
  const camPos = new Vector3(...scene.camera.pos);
  const far = farFor(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z), radius), camPos.length());
  const skyGeo = new SphereGeometry(far * 0.9, 48, 24);
  const skyPos = skyGeo.getAttribute("position") as BufferAttribute;
  const colors = new Float32Array(skyPos.count * 3);
  const tmp = new Color();
  for (let i = 0; i < skyPos.count; i++) {
    tmp.setRGB(...skyAt(scene.sky.top, scene.sky.bottom, skyPos.getY(i) / (far * 0.9)), SRGBColorSpace); // #rrggbb are sRGB; vertex colours are linear
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  skyGeo.setAttribute("color", new BufferAttribute(colors, 3));
  const skyMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false, toneMapped: false }); // the sky shows its colours as written
  const sky = new Mesh(skyGeo, skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  world.add(sky);
  disposables.push(skyGeo, skyMat);
  world.background = new Color(hexToInt(scene.sky.bottom));
  if (scene.sky.fog) world.fog = new Fog(hexToInt(scene.sky.fog.color), scene.sky.fog.near, scene.sky.fog.far);

  // --- camera ---------------------------------------------------------------------
  const camera = new PerspectiveCamera(scene.camera.fov, 1, 0.1, far);
  let lookAt: Vec3 = [0, 0, 0];

  const lookPoint = (look: Vec3 | string): Vec3 => {
    if (Array.isArray(look)) return [look[0], look[1], look[2]];
    const obj = byId.get(look);
    if (!obj) return [center.x, center.y, center.z];
    const b = new Box3().setFromObject(obj);
    const v = b.isEmpty() ? obj.getWorldPosition(new Vector3()) : b.getCenter(new Vector3());
    return [v.x, v.y, v.z];
  };

  // --- render loop: only when something changed, never while hidden or paused ---------
  let dirty = true;
  let paused = false;
  let raf = 0;
  let dead = false;

  const draw = () => {
    sky.position.copy(camera.position);
    renderer.render(world, camera);
    dirty = false;
  };
  const schedule = () => {
    if (dead || raf || !shouldDraw({ dirty, paused, hidden: document.hidden })) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!dead && shouldDraw({ dirty, paused, hidden: document.hidden })) draw();
    });
  };
  const cancel = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? cancel() : schedule());
  document.addEventListener("visibilitychange", onVisibility);

  const resize = () => {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
    schedule();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const setCamera = (v: CameraView) => {
    camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
    lookAt = lookPoint(v.look);
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    if (typeof v.fov === "number" && v.fov !== camera.fov) {
      camera.fov = v.fov;
      camera.updateProjectionMatrix();
    }
    dirty = true;
    schedule();
  };

  resize();
  setCamera(scene.camera);

  return {
    canvas,
    setCamera,
    camera: () => ({ pos: [camera.position.x, camera.position.y, camera.position.z], look: [...lookAt], fov: camera.fov }),
    lookPoint,
    render: () => {
      dirty = true;
      schedule();
    },
    resize,
    pause: () => {
      paused = true;
      cancel();
    },
    resume: () => {
      paused = false;
      schedule();
    },
    poster: () => {
      draw(); // toDataURL must read the buffer in the same task as the draw (preserveDrawingBuffer stays off)
      return canvas.toDataURL("image/jpeg", 0.85);
    },
    dispose: () => {
      if (dead) return;
      dead = true;
      cancel();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      world.traverse((o) => {
        if (o instanceof InstancedMesh) o.dispose();
      });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
