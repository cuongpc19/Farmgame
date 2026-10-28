import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { prop, propSize } from "./props3d";

/**
 * Procedural models (no model files). Everything is built from primitives with smooth-shaded
 * Lambert materials (Farm Valley, user 2026-10-28: a smooth cartoon look, not flat-shaded low-poly;
 * boxes keep their crisp faces): cheap on mobile. Materials are shared through `mat()` so 200
 * meshes of one colour cost one material.
 */
const mats = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${opts.emissive ?? 0}|${opts.opacity ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive ?? 0,
      transparent: opts.transparent ?? (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    mats.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

export interface CartModel {
  root: THREE.Group;
  stackAnchor: THREE.Object3D;
  wheels: THREE.Object3D[];
}

/** Mine cart (open steel tub on 4 wheels), ~1.3 long along Z. */
/** A Kenney wheel on a pivot at its axle (spin it with rotation.x). */
function kenneyWheel(d: number): THREE.Group {
  const pivot = new THREE.Group();
  const w = prop("wheel", d);
  w.position.y = -d / 2;
  pivot.add(w);
  return pivot;
}

export function makeCart(): CartModel {
  // A wooden mine cart (Farm Valley): a plank tub with iron corner straps and an iron rim, a darker inside, on four
  // Kenney wheels. The body is baked (a few draws).
  const root = new THREE.Group();
  const W = 1.15;
  const H = 0.62;
  const D = 1.5;
  const y0 = 0.35;
  const tub = new THREE.Mesh(new RoundedBoxGeometry(W - 0.06, H - 0.04, D - 0.06, 2, 0.06), mat(0x9a6a3c));
  tub.position.y = y0 + H / 2;
  tub.castShadow = true;
  root.add(tub);
  // Planks on the sides and ends: horizontal boards in two tones.
  for (let i = 0; i < 3; i++) {
    const y = y0 + (H / 3) * (i + 0.5);
    const tone = i % 2 ? 0xa8743f : 0xb8844c;
    for (const sx of [-1, 1]) {
      const b = mesh(box(0.05, H / 3 - 0.03, D - 0.1), tone);
      b.position.set((sx * W) / 2, y, 0);
      root.add(b);
    }
    for (const sz of [-1, 1]) {
      const b = mesh(box(W - 0.1, H / 3 - 0.03, 0.05), tone);
      b.position.set(0, y, (sz * D) / 2);
      root.add(b);
    }
  }
  const inside = mesh(box(W - 0.2, 0.05, D - 0.2), 0x4a3424);
  inside.position.y = y0 + H - 0.02;
  root.add(inside);
  // Iron: rim round the top, straps at the corners, a band low down, rivets.
  for (const [w, d, x, z] of [[W + 0.1, 0.1, 0, D / 2], [W + 0.1, 0.1, 0, -D / 2], [0.1, D + 0.1, W / 2, 0], [0.1, D + 0.1, -W / 2, 0]] as const) {
    const rim = new THREE.Mesh(new RoundedBoxGeometry(w, 0.1, d, 2, 0.04), mat(0x4a4642));
    rim.position.set(x, y0 + H, z);
    rim.castShadow = true;
    root.add(rim);
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const st = mesh(box(0.1, H, 0.1), 0x4a4642);
      st.position.set((sx * W) / 2, y0 + H / 2, (sz * D) / 2);
      root.add(st);
    }
  for (const z of [-0.45, 0.45]) {
    const b = mesh(box(W + 0.1, 0.12, 0.12), 0x4a4642);
    b.position.set(0, y0 + 0.12, z);
    root.add(b);
  }
  const axle = mesh(cyl(0.05, 0.05, 1.2, 8).rotateZ(Math.PI / 2), 0x3a3632);
  axle.position.set(0, 0.21, 0.45);
  const axle2 = axle.clone();
  axle2.position.z = -0.45;
  root.add(axle, axle2);
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.5, 0.45], [0.5, 0.45], [-0.5, -0.45], [0.5, -0.45]] as const) {
    const w = kenneyWheel(0.42);
    w.position.set(x, 0.21, z);
    root.add(w);
    wheels.push(w);
  }
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, 0.45, 0);
  // Bake the body into vertex colours (one draw); the wheels turn, so they are set aside meanwhile.
  for (const w of wheels) w.removeFromParent();
  bakeColors(root);
  root.add(...wheels, stackAnchor);
  return { root, stackAnchor, wheels };
}

let railM: THREE.MeshLambertMaterial | null = null;
/** Iron rails: steel grey with a brighter running top (u along the rail, v round it). */
function railMat(): THREE.MeshLambertMaterial {
  if (railM) return railM;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, "#5a5652");
  grad.addColorStop(0.35, "#8f8a84");
  grad.addColorStop(0.5, "#d2ccc4");
  grad.addColorStop(0.65, "#8f8a84");
  grad.addColorStop(1, "#5a5652");
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  railM = new THREE.MeshLambertMaterial({ map: t });
  return railM;
}

let sleeper: { geo: THREE.BufferGeometry; m: THREE.MeshLambertMaterial } | null = null;
function sleeperParts() {
  if (sleeper) return sleeper;
  // Non-indexed throughout: the rounded tie is non-indexed, the plates are not, and merging needs one kind.
  const coloured = (src: THREE.BufferGeometry, hex: number) => {
    const geo = src.index ? src.toNonIndexed() : src;
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.deleteAttribute("uv");
    return geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  };
  const geo = mergeGeometries([
    coloured(new RoundedBoxGeometry(1.15, 0.1, 0.26, 1, 0.03), 0x8a5c34),
    coloured(box(0.12, 0.03, 0.14).translate(-0.42, 0.06, 0), 0x4a4642),
    coloured(box(0.12, 0.03, 0.14).translate(0.42, 0.06, 0), 0x4a4642),
  ])!;
  sleeper = { geo, m: new THREE.MeshLambertMaterial({ vertexColors: true }) };
  return sleeper;
}
const sleeperGeo = () => sleeperParts().geo;
const sleeperMat = () => sleeperParts().m;

/** Straight track from a to b (XZ): iron rails on wooden sleepers with iron tie plates. */
export function makeRails(a: THREE.Vector3, b: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const ang = Math.atan2(dir.x, dir.z);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  // Round iron rails, lighter along the top (v runs round the rail); both in one mesh.
  const rails = [-0.42, 0.42].map((x) => {
    const r = new THREE.CylinderGeometry(0.055, 0.055, len, 8, 1, true);
    r.rotateX(Math.PI / 2);
    const pos = r.getAttribute("position");
    const uv = r.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5, 0.5 - Math.atan2(pos.getX(i), pos.getY(i)) / (Math.PI * 2));
    return r.translate(x, 0.14, 0);
  });
  const railMesh = new THREE.Mesh(mergeGeometries(rails)!, railMat());
  for (const r of rails) r.dispose();
  railMesh.castShadow = true;
  railMesh.receiveShadow = true;
  g.add(railMesh);
  // Sleepers: wooden ties with iron plates under the rails, one instanced mesh.
  const n = Math.max(2, Math.floor(len / 0.6));
  const sl = new THREE.InstancedMesh(sleeperGeo(), sleeperMat(), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m4.makeTranslation(0, 0.04, -len / 2 + (i + 0.5) * (len / n));
    sl.setMatrixAt(i, m4);
  }
  sl.receiveShadow = true;
  g.add(sl);
  g.position.copy(mid);
  g.rotation.y = ang;
  return g;
}

/** Flat square pad on the ground with a coloured frame (action / buy zones). */
export function makePad(size: number, color: number): { root: THREE.Group; fill: THREE.Mesh } {
  const root = new THREE.Group();
  const frameW = 0.12;
  const fm = mat(color);
  const half = size / 2;
  for (const [x, z, w, d] of [
    [0, half - frameW / 2, size, frameW],
    [0, -half + frameW / 2, size, frameW],
    [half - frameW / 2, 0, frameW, size],
    [-half + frameW / 2, 0, frameW, size],
  ] as const) {
    const s = new THREE.Mesh(box(w, 0.04, d), fm);
    s.position.set(x, 0.03, z);
    root.add(s);
  }
  const base = new THREE.Mesh(box(size - frameW * 2, 0.02, size - frameW * 2), mat(color, { opacity: 0.22 }));
  base.position.y = 0.02;
  root.add(base);
  // Progress fill grows from the centre while the player stands on the pad.
  const fill = new THREE.Mesh(box(size - frameW * 2, 0.025, size - frameW * 2), mat(color, { opacity: 0.6 }));
  fill.position.y = 0.025;
  fill.scale.set(0.001, 1, 0.001);
  root.add(fill);
  return { root, fill };
}

/* ---------- rentable vehicles ---------- */

export interface VehicleModel {
  root: THREE.Group;
  wheels: THREE.Object3D[];
  stackAnchor: THREE.Object3D;
  /** Animated tool (bucket / breaker arm / roller) — swung on each hit. */
  tool: THREE.Object3D | null;
  /** Parts that spin about their own Z axis while working (drill bits). */
  spin?: THREE.Object3D[];
  /** This machine's own glowing material (Inferno Breaker tip), flared on each hit. */
  glow?: THREE.MeshLambertMaterial;
}

/** Wheelbarrow pushed by the player (no engine). Handles at −z, tray at +z. */
export function makeWheelbarrow(): VehicleModel {
  const root = prop("barrow", 2.9);
  const s = propSize(root);
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, s.y * 0.72, s.z * 0.08);
  root.add(stackAnchor);
  return { root, wheels: [], stackAnchor, tool: null };
}

/** Kenney tractor wheels (named nodes, axle along X). */
function tractorWheels(root: THREE.Object3D, front = true): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (!o.name.startsWith("wheel-")) return;
    if (!front && o.name.startsWith("wheel-front")) o.visible = false;
    else out.push(o);
  });
  return out;
}

/** Wheel loader (bulldozer model, blade at +Z); ore rides on the blade. */
export function makeLoader(): VehicleModel {
  const root = prop("dozer", 3.1);
  const s = propSize(root);
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, s.y * 0.42, s.z * 0.36);
  root.add(stackAnchor);
  return { root, wheels: [], stackAnchor, tool: null };
}

/** Hydraulic breaker: tractor base with a boom and chisel hammer pointing forward (+z). */
export function makeBreaker(color = 0xf4b80f): VehicleModel {
  const root = prop("tractor", 2.4);
  const s = propSize(root);
  const tool = new THREE.Group();
  const boom = mesh(box(0.25, 0.25, 1.6), color);
  boom.position.set(0, 0.35, 0.7);
  boom.rotation.x = -0.35;
  const stick = mesh(box(0.2, 0.2, 1.1), color);
  stick.position.set(0, 0.2, 1.65);
  stick.rotation.x = 0.7;
  const hammer = mesh(box(0.35, 0.7, 0.35), 0x40444b);
  hammer.position.set(0, -0.25, 2.05);
  const chisel = mesh(new THREE.ConeGeometry(0.1, 0.45, 6), 0xb0b6be);
  chisel.rotation.x = Math.PI;
  chisel.position.set(0, -0.8, 2.05);
  tool.add(boom, stick, hammer, chisel);
  tool.position.set(0, s.y * 0.62, 0.15);
  root.add(tool);
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, s.y * 0.8, -s.z * 0.3);
  root.add(stackAnchor);
  return { root, wheels: tractorWheels(root), stackAnchor, tool };
}

/** Roller crusher: tractor base whose front wheels are replaced by a toothed drum ~3 m wide. */
export function makeRoller(): VehicleModel {
  const root = prop("tractor", 2.4);
  const s = propSize(root);
  const wheels = tractorWheels(root, false);
  const tool = new THREE.Group();
  const drumGeo = cyl(0.6, 0.6, 3.0, 14);
  drumGeo.rotateZ(Math.PI / 2);
  const drum = mesh(drumGeo, 0x6b6f76);
  tool.add(drum);
  for (let i = 0; i < 10; i++) {
    const tooth = mesh(box(0.12, 0.25, 0.12), 0xc8ccd2);
    const a = (i / 10) * Math.PI * 2;
    tooth.position.set(-1.3 + (i % 5) * 0.65, Math.sin(a) * 0.68, Math.cos(a) * 0.68);
    tool.add(tooth);
  }
  // Yellow side arms holding the drum.
  for (const x of [-1.45, 1.45]) {
    const arm = mesh(box(0.12, 0.18, 1.1), 0xf4b80f);
    arm.position.set(x, 0.1, -0.5);
    tool.add(arm);
  }
  tool.position.set(0, 0.62, s.z * 0.5 + 0.2);
  root.add(tool);
  wheels.push(tool);
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, s.y * 0.8, -s.z * 0.3);
  root.add(stackAnchor);
  return { root, wheels, stackAnchor, tool };
}

/** Dump truck: big bed at the back (−z), cab at front (+z). */
export function makeDumpTruck(): VehicleModel {
  const root = prop("dump", 3.8);
  const s = propSize(root);
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, s.y * 0.55, -s.z * 0.12);
  root.add(stackAnchor);
  return { root, wheels: [], stackAnchor, tool: null };
}

/** All-terrain vehicle (quad) with a rack for oil barrels. */
export function makeAtv(color = 0x5fbf7a): VehicleModel {
  // Kenney-style quad bike: chunky rounded body, black seat, handlebar, front light,
  // rear rack for oil barrels, Kenney wheels.
  const root = new THREE.Group();
  const paint = mat(color);
  const dark = mat(0x3d4049);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.42, 1.55, 2, 0.14), paint);
  body.position.set(0, 0.78, 0.05);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.3, 0.6, 2, 0.12), paint);
  hood.position.set(0, 0.98, 0.55);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.2, 0.75, 2, 0.08), dark);
  seat.position.set(0, 1.08, -0.2);
  const light = new THREE.Mesh(box(0.28, 0.14, 0.06), mat(0xfff4c8, { emissive: 0x6b5a20 }));
  light.position.set(0, 0.98, 0.86);
  const stem = mesh(cyl(0.04, 0.04, 0.4, 6), 0x3d4049);
  stem.position.set(0, 1.25, 0.42);
  const bar = mesh(box(0.9, 0.07, 0.07), 0x3d4049);
  bar.position.set(0, 1.44, 0.42);
  for (const o of [body, hood, seat]) o.castShadow = true;
  root.add(body, hood, seat, light, stem, bar);
  // Rear rack.
  const rack = mesh(box(0.95, 0.05, 0.6), 0x3d4049);
  rack.position.set(0, 1.02, -0.62);
  root.add(rack);
  for (const x of [-0.45, 0.45]) {
    const rail = mesh(box(0.05, 0.22, 0.6), 0x3d4049);
    rail.position.set(x, 1.13, -0.62);
    const fender = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.08, 0.75, 1, 0.03), paint);
    fender.position.set(x * 1.45, 0.82, 0.48);
    const fenderB = fender.clone();
    fenderB.position.z = -0.5;
    root.add(rail, fender, fenderB);
  }
  const wheels: THREE.Object3D[] = [];
  for (const z of [0.5, -0.5])
    for (const x of [-0.66, 0.66]) {
      const w = kenneyWheel(0.72);
      w.position.set(x, 0.36, z);
      root.add(w);
      wheels.push(w);
    }
  const stackAnchor = new THREE.Object3D();
  stackAnchor.position.set(0, 1.06, -0.62);
  root.add(stackAnchor);
  return { root, wheels, stackAnchor, tool: null };
}

/* ---------- later-stage machines (stage 3+) ----------
 * Procedural like the ATV: rounded bodies, primitive tools, Kenney wheels. Model units, front
 * at +Z, on y = 0; Vehicle scales them ×1.5 like the others. Each has its own colour and
 * silhouette from the game camera: twin drills (orange), a giant mallet (blue), a glowing
 * breaker (crimson), a huge teal hauler, a bucket wheel (purple / yellow), a tanker (red / silver).
 */

const rbox = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.99);

/** Add a mesh of `geo` to `parent` at (x, y, z), optionally turned about X. */
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: number | THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof material === "number" ? mat(material) : material);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.castShadow = true;
  parent.add(m);
  return m;
}

const DARK = 0x2f3238;
const STEEL = 0xc8ccd2;
const GLASS = 0x2c3a4a;

/** Crawler tracks: two dark belts with painted side frames and idler hubs that turn as wheels. */
function crawler(root: THREE.Object3D, len: number, gauge: number, h: number, paint: number, wheels: THREE.Object3D[]): void {
  for (const sx of [-1, 1]) {
    const x = (sx * gauge) / 2;
    put(root, rbox(0.42, h, len, h * 0.48), 0x2b2e34, x, h / 2, 0);
    put(root, box(0.05, h * 0.4, len * 0.62), paint, x + sx * 0.22, h * 0.5, 0);
    for (const z of [-len / 2 + h * 0.5, len / 2 - h * 0.5]) {
      const hub = new THREE.Group();
      const disc = cyl(h * 0.34, h * 0.34, 0.47, 8);
      disc.rotateZ(Math.PI / 2);
      put(hub, disc, 0x8a9099, 0, 0, 0);
      put(hub, box(0.49, h * 0.1, h * 0.56), 0x464a52, 0, 0, 0);
      hub.position.set(x, h / 2, z);
      root.add(hub);
      wheels.push(hub);
    }
  }
}

/** Operator cab: painted box, dark windows on three sides, flat roof. Sits on y = 0. */
function cabin(w: number, h: number, d: number, paint: number): THREE.Group {
  const g = new THREE.Group();
  put(g, rbox(w, h, d, 0.07), paint, 0, h / 2, 0);
  put(g, box(w * 0.82, h * 0.42, 0.04), GLASS, 0, h * 0.64, d / 2 + 0.005);
  for (const sx of [-1, 1]) put(g, box(0.04, h * 0.42, d * 0.62), GLASS, (sx * w) / 2 + sx * 0.005, h * 0.64, 0.04);
  put(g, box(w * 1.08, 0.07, d * 1.08), DARK, 0, h + 0.035, 0);
  return g;
}

/**
 * Merge the meshes under `group` (outside the `live` subtrees, which move on their own) into
 * one mesh per material, in the group's space: a machine of ~40 primitives draws in ~8 calls.
 * Textured meshes (Kenney wheels) are left alone.
 */
function bake(group: THREE.Object3D, live: THREE.Object3D[] = []): void {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const skip = new Set(live);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const done: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && !(m.material as THREE.MeshLambertMaterial).map) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const list = byMat.get(m.material);
      if (list) list.push(g);
      else byMat.set(m.material, [g]);
      done.push(m);
    }
    for (const c of o.children) walk(c);
  };
  walk(group);
  for (const m of done) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const [material, geos] of byMat) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    group.add(mesh);
  }
}

const vcMats = new Map<string, THREE.MeshLambertMaterial>();
/**
 * Like `bake`, for scenery that never moves: every plain coloured mesh under `group` goes into one mesh per
 * opacity / emissive / shadow flags, its colour written into the vertices, so a building of ~50 primitives draws
 * in two or three calls (user 2026-10-25: the restaurant's ~100 primitives drew twice each, shadows included, and
 * frame rates on stage 1 fell from 55 to 30). Meshes baked before keep their vertex colours; textured ones stay.
 */
export function bakeColors(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const parts = new Map<string, { geos: THREE.BufferGeometry[]; m: THREE.MeshLambertMaterial; cast: boolean; receive: boolean }>();
  const done: THREE.Mesh[] = [];
  group.traverse((o) => {
    const me = o as THREE.Mesh;
    const m = me.material as THREE.MeshLambertMaterial;
    if (!me.isMesh || Array.isArray(me.material) || !m.isMeshLambertMaterial || m.map) return;
    const g = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
    const keep = m.vertexColors && g.attributes.color;
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && !(keep && k === "color")) g.deleteAttribute(k);
    if (!keep) {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) (c[i * 3] = m.color.r), (c[i * 3 + 1] = m.color.g), (c[i * 3 + 2] = m.color.b);
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld));
    const key = `${m.opacity}|${m.emissive.getHex()}|${me.castShadow}|${me.receiveShadow}`;
    let mm = vcMats.get(key);
    if (!mm) {
      mm = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: m.emissive.getHex(), transparent: m.opacity < 1, opacity: m.opacity, depthWrite: m.opacity >= 1 });
      vcMats.set(key, mm);
    }
    const p = parts.get(key);
    if (p) p.geos.push(g);
    else parts.set(key, { geos: [g], m: mm, cast: me.castShadow, receive: me.receiveShadow });
    done.push(me);
  });
  for (const me of done) {
    me.removeFromParent();
    me.geometry.dispose();
  }
  // Drop the groups that held only those meshes.
  const prune = (o: THREE.Object3D): boolean => {
    for (const c of [...o.children]) if (prune(c)) c.removeFromParent();
    return o !== group && o.type === "Group" && !o.children.length;
  };
  prune(group);
  for (const { geos, m, cast, receive } of parts.values()) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
  }
}

/** Bake a finished machine: the body, the tool, and each spinning part on its own. */
function finish(v: VehicleModel): VehicleModel {
  const live = [...v.wheels, ...(v.tool ? [v.tool] : [])];
  bake(v.root, live);
  if (v.tool) bake(v.tool, v.spin ?? []);
  for (const s of v.spin ?? []) bake(s);
  for (const w of v.wheels) bake(w);
  return v;
}

const anchorAt = (root: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  root.add(a);
  return a;
};

/** Drill Crusher: orange tracked carrier pushing two spinning auger drills side by side. */
export function makeDrillCrusher(): VehicleModel {
  const root = new THREE.Group();
  const paint = 0xf47b20;
  const wheels: THREE.Object3D[] = [];
  crawler(root, 2.3, 1.3, 0.5, paint, wheels);
  put(root, rbox(1.45, 0.32, 2.0, 0.06), paint, 0, 0.66, -0.05);
  put(root, rbox(1.2, 0.5, 0.7, 0.08), paint, 0, 1.06, -0.65);
  put(root, box(0.9, 0.24, 0.04), DARK, 0, 1.06, -1.01);
  put(root, cyl(0.06, 0.06, 0.55, 6), DARK, 0.42, 1.5, -0.8);
  const cab = cabin(0.78, 0.74, 0.78, paint);
  cab.position.set(-0.28, 0.82, 0.2);
  root.add(cab);
  // Mast: a crossbar in front held by two arms.
  put(root, box(1.5, 0.22, 0.22), DARK, 0, 0.78, 1.0);
  for (const sx of [-1, 1]) put(root, box(0.16, 0.16, 0.62), paint, sx * 0.62, 0.74, 0.72);
  const tool = new THREE.Group();
  tool.position.set(0, 0.78, 1.08);
  const spin: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const housing = cyl(0.22, 0.24, 0.34, 10);
    housing.rotateX(Math.PI / 2);
    put(tool, housing, DARK, sx * 0.45, 0, 0.14);
    put(tool, box(0.5, 0.06, 0.06), 0xf2b51a, sx * 0.45, 0.25, 0.14);
    const bit = new THREE.Group();
    bit.position.set(sx * 0.45, 0, 0.31);
    const cone = new THREE.ConeGeometry(0.21, 0.92, 8);
    cone.rotateX(Math.PI / 2);
    put(bit, cone, STEEL, 0, 0, 0.46);
    // Auger flights: a helix of fins along the cone.
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const r = 0.2 * (1 - t) + 0.02;
      const a = i * 1.15;
      const fin = put(bit, box(0.05, r * 1.1, 0.07), 0x6b7078, Math.sin(a) * r * 0.6, Math.cos(a) * r * 0.6, 0.08 + t * 0.72);
      fin.rotation.z = -a;
    }
    tool.add(bit);
    spin.push(bit);
  }
  root.add(tool);
  return finish({ root, wheels, stackAnchor: anchorAt(root, 0, 1.32, -0.65), tool, spin });
}

/** Crush Hammer: blue tracked carrier whose whole arm is a giant sledgehammer. */
export function makeCrushHammer(): VehicleModel {
  const root = new THREE.Group();
  const paint = 0x2e78d2;
  const wheels: THREE.Object3D[] = [];
  crawler(root, 2.3, 1.45, 0.55, 0xf2b51a, wheels);
  put(root, rbox(1.5, 0.45, 2.3, 0.1), paint, 0, 0.78, -0.1);
  const cab = cabin(0.72, 0.78, 0.8, paint);
  cab.position.set(0.32, 1.0, -0.5);
  root.add(cab);
  put(root, rbox(1.4, 0.48, 0.42, 0.08), DARK, 0, 1.24, -1.08);
  for (const x of [-0.45, 0.45]) put(root, box(0.42, 0.08, 0.43), 0xf2b51a, x, 1.24, -1.08);
  // Boom on a pivot (the animated tool): rest pose rises toward the front.
  const tool = new THREE.Group();
  tool.position.set(-0.3, 1.28, -0.2);
  // The whole arm is a giant sledgehammer: the boom is the handle, the head stands across its tip.
  const arm = new THREE.Group();
  arm.rotation.x = -0.12;
  tool.add(arm);
  put(arm, box(0.28, 0.32, 2.4), paint, 0, 0, 1.1);
  put(arm, cyl(0.2, 0.2, 0.4, 10).rotateZ(Math.PI / 2), DARK, 0, 0, 0);
  for (const z of [0.6, 1.5]) put(arm, box(0.3, 0.06, 0.18), 0xf2b51a, 0, 0.17, z);
  put(arm, rbox(0.72, 1.3, 0.7, 0.1), 0x555b65, 0, -0.08, 2.45);
  for (const y of [-0.62, 0.46]) put(arm, box(0.76, 0.12, 0.74), 0xf2b51a, 0, y, 2.45);
  put(arm, box(0.6, 0.05, 0.58), 0x8a9099, 0, -0.75, 2.45);
  root.add(tool);
  return finish({ root, wheels, stackAnchor: anchorAt(root, 0, 1.5, -1.08), tool });
}

/** Inferno Breaker: crimson heavy breaker on tracks; its chisel and vents glow (material in `glow`). */
export function makeInfernoBreaker(): VehicleModel {
  const root = new THREE.Group();
  const paint = 0xb3201b;
  const arm = 0xff7a1a;
  const glow = new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0xff5a00, emissiveIntensity: 0.7, flatShading: true });
  const wheels: THREE.Object3D[] = [];
  crawler(root, 2.5, 1.5, 0.55, arm, wheels);
  put(root, rbox(1.6, 0.62, 2.0, 0.1), paint, 0, 0.88, -0.25);
  const cab = cabin(0.74, 0.8, 0.8, paint);
  cab.position.set(0.38, 1.19, 0.3);
  root.add(cab);
  // Heat vents on the back and twin stacks with glowing caps.
  for (let i = 0; i < 3; i++) put(root, box(1.0, 0.06, 0.04), glow, 0, 0.74 + i * 0.16, -1.26);
  for (let i = 0; i < 3; i++) put(root, box(0.62, 0.03, 0.08), glow, -0.3, 1.2, -0.65 - i * 0.18);
  for (const x of [-0.5, 0.5]) {
    put(root, cyl(0.08, 0.1, 0.72, 7), DARK, x, 1.55, -0.85);
    put(root, cyl(0.09, 0.09, 0.08, 7), glow, x, 1.94, -0.85);
  }
  const tool = new THREE.Group();
  tool.position.set(-0.3, 1.25, 0.45);
  tool.userData.restY = 1.25;
  put(tool, box(0.34, 0.34, 1.75), arm, 0, 0.38, 0.75, -0.45);
  put(tool, box(0.28, 0.28, 1.25), arm, 0, 0.42, 1.85, 0.85);
  put(tool, box(0.5, 0.9, 0.5), DARK, 0, -0.12, 2.3);
  put(tool, box(0.54, 0.14, 0.54), paint, 0, 0.12, 2.3);
  for (const y of [-0.18, -0.4]) put(tool, box(0.54, 0.07, 0.54), glow, 0, y, 2.3);
  put(tool, cyl(0.21, 0.21, 0.1, 8), glow, 0, -0.6, 2.3);
  put(tool, new THREE.ConeGeometry(0.19, 0.66, 6).rotateX(Math.PI), glow, 0, -0.97, 2.3);
  root.add(tool);
  return finish({ root, wheels, stackAnchor: anchorAt(root, 0, 1.2, -0.7), tool, glow });
}

/** Haul Truck: a huge teal mining truck (cab under the bed's canopy, six big tyres). */
export function makeHaulTruck(): VehicleModel {
  const root = new THREE.Group();
  const paint = 0x22a194;
  const wheels: THREE.Object3D[] = [];
  put(root, box(0.8, 0.45, 3.8), 0x34373d, 0, 1.0, 0);
  for (const [x, z] of [[-1.0, 1.35], [1.0, 1.35], [-1.0, -1.05], [1.0, -1.05], [-0.55, -1.05], [0.55, -1.05]] as const) {
    const w = kenneyWheel(1.25);
    w.position.set(x, 0.625, z);
    root.add(w);
    wheels.push(w);
  }
  put(root, rbox(1.9, 0.5, 0.9, 0.08), paint, 0, 1.38, 1.55);
  put(root, box(1.1, 0.34, 0.06), DARK, 0, 1.3, 2.01);
  for (const x of [-0.75, 0.75]) put(root, box(0.22, 0.12, 0.04), mat(0xfff4c8, { emissive: 0x6b5a20 }), x, 1.48, 2.01);
  const cab = cabin(0.72, 0.62, 0.7, 0xe9ece6);
  cab.position.set(-0.52, 1.63, 1.45);
  root.add(cab);
  // Bed: floor, sides, front wall and the canopy over the cab.
  const bed = new THREE.Group();
  bed.position.set(0, 1.55, -0.55);
  root.add(bed);
  put(bed, box(2.1, 0.14, 2.9), paint, 0, 0.07, 0);
  for (const sx of [-1, 1]) {
    put(bed, box(0.14, 0.78, 2.9), paint, sx * 1.05, 0.46, 0);
    for (const z of [-0.95, 0, 0.95]) put(bed, box(0.06, 0.62, 0.12), 0x1b7f75, sx * 1.14, 0.42, z);
  }
  put(bed, box(2.1, 1.12, 0.14), paint, 0, 0.62, 1.45);
  put(bed, box(2.1, 0.12, 1.15), paint, 0, 1.15, 2.0);
  for (let i = 0; i < 5; i++) put(bed, box(0.4, 0.1, 0.03), i % 2 ? DARK : 0xf2b51a, -0.8 + i * 0.4, 0.28, -1.46);
  return finish({ root, wheels, stackAnchor: anchorAt(bed, 0, 0.14, -0.05), tool: null });
}

/** Wheel Crusher: purple tracked carrier with a yellow bucket wheel in front and an ore hopper behind. */
export function makeWheelCrusher(): VehicleModel {
  const root = new THREE.Group();
  const paint = 0x7d4fd0;
  const deep = 0x5b3a9a;
  const yellow = 0xf2b51a;
  const wheels: THREE.Object3D[] = [];
  crawler(root, 2.4, 1.5, 0.5, yellow, wheels);
  put(root, rbox(1.6, 0.5, 2.1, 0.1), paint, 0, 0.82, -0.25);
  const cab = cabin(0.66, 0.72, 0.66, paint);
  cab.position.set(-0.48, 1.07, 0.42);
  root.add(cab);
  // Hopper (cargo) at the back.
  const hop = new THREE.Group();
  hop.position.set(0.12, 1.07, -0.78);
  root.add(hop);
  put(hop, box(1.36, 0.08, 1.0), deep, 0, 0.04, 0);
  for (const sx of [-1, 1]) put(hop, box(0.08, 0.42, 1.0), deep, sx * 0.68, 0.25, 0);
  for (const sz of [-1, 1]) put(hop, box(1.36, 0.42, 0.08), deep, 0, 0.25, sz * 0.5);
  // Boom out to the wheel, and a conveyor back up to the hopper.
  put(root, box(0.26, 0.28, 1.5), paint, 0.42, 1.12, 1.02, 0.22);
  put(root, box(0.34, 0.06, 1.75), DARK, -0.02, 1.25, 0.62, 0.3);
  const tool = new THREE.Group();
  tool.position.set(-0.02, 0.95, 1.85);
  const ring = new THREE.TorusGeometry(0.78, 0.09, 6, 16);
  ring.rotateY(Math.PI / 2);
  put(tool, ring, yellow, 0, 0, 0);
  put(tool, cyl(0.2, 0.2, 0.72, 8).rotateZ(Math.PI / 2), DARK, 0.16, 0, 0);
  for (let i = 0; i < 3; i++) put(tool, box(0.1, 1.5, 0.1), yellow, 0, 0, 0, (i * Math.PI) / 3);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = put(tool, box(0.36, 0.26, 0.3), 0x9aa1ab, 0, Math.sin(a) * 0.9, Math.cos(a) * 0.9, -a);
    put(b, box(0.38, 0.06, 0.1), DARK, 0, 0.13, 0.12);
  }
  root.add(tool);
  return finish({ root, wheels, stackAnchor: anchorAt(hop, 0, 0.08, 0), tool });
}

/** Fuel Truck: red cab pulling a silver tank; the hose reel at the back is its tool. */
export function makeFuelTruck(): VehicleModel {
  const root = new THREE.Group();
  const red = 0xd8392b;
  const wheels: THREE.Object3D[] = [];
  put(root, box(1.15, 0.3, 4.0), 0x34373d, 0, 0.66, -0.05);
  for (const [x, z] of [[-0.72, 1.3], [0.72, 1.3], [-0.72, -0.5], [0.72, -0.5], [-0.72, -1.2], [0.72, -1.2]] as const) {
    const w = kenneyWheel(0.8);
    w.position.set(x, 0.4, z);
    root.add(w);
    wheels.push(w);
  }
  put(root, rbox(1.45, 1.0, 1.0, 0.12), red, 0, 1.25, 1.35);
  put(root, box(1.2, 0.4, 0.04), GLASS, 0, 1.5, 1.86);
  for (const sx of [-1, 1]) put(root, box(0.04, 0.36, 0.55), GLASS, sx * 0.73, 1.5, 1.4);
  put(root, box(1.5, 0.18, 0.16), DARK, 0, 0.72, 1.9);
  for (const x of [-0.5, 0.5]) put(root, box(0.24, 0.12, 0.04), mat(0xfff4c8, { emissive: 0x6b5a20 }), x, 0.95, 1.86);
  put(root, box(0.7, 0.08, 0.14), mat(0xff8a1f, { emissive: 0x803000 }), 0, 1.79, 1.3);
  // Tank with red bands, hatches and hazard diamonds.
  const tank = cyl(0.68, 0.68, 2.3, 14);
  tank.rotateX(Math.PI / 2);
  put(root, tank, 0xd9dde2, 0, 1.5, -0.35);
  for (const z of [-1.3, 0.6]) {
    const band = cyl(0.7, 0.7, 0.14, 14);
    band.rotateX(Math.PI / 2);
    put(root, band, red, 0, 1.5, z);
  }
  for (const z of [-0.85, -0.05]) put(root, cyl(0.15, 0.15, 0.1, 8), DARK, 0, 2.2, z);
  for (const sx of [-1, 1]) {
    const d = put(root, box(0.03, 0.34, 0.34), 0xff8a1f, sx * 0.69, 1.5, -0.35);
    d.rotation.x = Math.PI / 4;
  }
  const tool = new THREE.Group();
  tool.position.set(0, 1.0, -1.9);
  put(tool, cyl(0.3, 0.3, 0.9, 10).rotateZ(Math.PI / 2), 0xf2b51a, 0, 0, 0);
  put(tool, cyl(0.34, 0.34, 0.6, 10).rotateZ(Math.PI / 2), 0x23252a, 0, 0, 0);
  put(tool, box(0.94, 0.08, 0.7), 0xf2b51a, 0, 0, 0);
  root.add(tool);
  return finish({ root, wheels, stackAnchor: anchorAt(root, 0, 2.2, -0.35), tool });
}

/** The model of a rentable machine by equipment key (the Wheel Loader for anything unknown). */
export function makeVehicleModel(key: string): VehicleModel {
  const v = (() => {
    switch (key) {
      case "wheelbarrow": return makeWheelbarrow();
      case "hydraulicBreaker": return makeBreaker();
      case "rollerCrusher": return makeRoller();
      case "dumpTruck": return makeDumpTruck();
      case "allTerrainVehicle": return makeAtv();
      case "drillCrusher": return makeDrillCrusher();
      case "crushHammer": return makeCrushHammer();
      case "infernoBreaker": return makeInfernoBreaker();
      case "haulTruck": return makeHaulTruck();
      case "wheelCrusher": return makeWheelCrusher();
      case "fuelTruck": return makeFuelTruck();
      default: return makeLoader();
    }
  })();
  const [scheme, greys] = SCHEME[key] ?? ["red"];
  farmLivery(v.root, scheme, greys ?? false);
  return v;
}

/* ---------- Farm Valley livery (Candy Miner: pink / cream / mint; Mars Miner: white / orange / teal) ---------- */

/** Paint schemes for farm machines: a body colour, its trim and an accent; neutrals stay as they are. */
const SCHEMES = {
  /** Classic red tractor, cream trim, green accents. */
  red: { body: 0xd8432f, trim: 0xfff1d6, accent: 0x4f9a3a },
  /** Green tractor with yellow trim. */
  green: { body: 0x3f9a3a, trim: 0xf6c431, accent: 0xf6c431 },
  /** Yellow machine with red trim. */
  yellow: { body: 0xf2b51a, trim: 0xd8432f, accent: 0x3f9a3a },
  /** Blue body, cream trim (the odd one out on a farm, for variety). */
  blue: { body: 0x3f74c4, trim: 0xfff1d6, accent: 0xf6c431 },
} as const;
export type LiveryScheme = keyof typeof SCHEMES;
type Scheme = (typeof SCHEMES)[LiveryScheme];

/** Which scheme each machine wears (equipment keys), and whether its light grey panels take the body colour too
 * (Kenney's tractor and pickup are grey, their yellow is only trim); anything else is red. */
const SCHEME: Record<string, [LiveryScheme, boolean?]> = {
  wheelbarrow: ["green"],
  hydraulicBreaker: ["red", true],
  wheelLoader: ["green"],
  rollerCrusher: ["yellow", true],
  dumpTruck: ["red"],
  allTerrainVehicle: ["green"],
  drillCrusher: ["yellow"],
  crushHammer: ["blue"],
  infernoBreaker: ["red"],
  haulTruck: ["green"],
  wheelCrusher: ["yellow"],
  fuelTruck: ["red"],
};

interface Paint {
  sc: Scheme;
  /** The machine's own main paint hue (0..1): that colour becomes the body. */
  main: number;
  greys: boolean;
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

/**
 * Where a colour goes in the livery: the machine's main paint becomes the body colour, other reds the trim, any
 * other paint the accent; light greys become the body too when `greys`; whites, darker greys, blacks and browns
 * (steel, glass, tyres, wood) stay as they are. The model's light and shade carry over. Lightness and saturation
 * are judged as seen (sRGB): in linear terms Kenney's mid-grey tractor read as dark and kept its grey.
 */
function liveryOf(c: THREE.Color, p: Paint): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  let target: number | null = null;
  if (p.greys && hsl.s < 0.22 && hsl.l > 0.42 && hsl.l < 0.9) target = p.sc.body;
  else if (hsl.l < 0.15 || hsl.l > 0.92 || hsl.s <= 0.3) return c;
  // Dark browns (wood, leather, rust) stay.
  else if (hsl.h >= 0.02 && hsl.h < 0.12 && hsl.l < 0.45) return c;
  else if (hueGap(hsl.h, p.main) < 0.05) target = p.sc.body;
  else if (hsl.h < 0.04 || hsl.h >= 0.92) target = p.sc.trim;
  else target = p.sc.accent;
  const out = new THREE.Color(target);
  const o = { h: 0, s: 0, l: 0 };
  out.getHSL(o, THREE.SRGBColorSpace);
  return out.setHSL(o.h, o.s, THREE.MathUtils.clamp(o.l + (hsl.l - 0.6) * 0.45, 0.15, 0.85), THREE.SRGBColorSpace);
}

const liveried = new Map<string, THREE.Material>();

/** A texture whose every pixel is put through liveryOf (the Kenney kits' colour atlas). */
function liveryTexture(src: THREE.Texture, p: Paint): THREE.Texture {
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const col = new THREE.Color();
  for (let i = 0; i < px.length; i += 4) {
    col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace);
    const out = liveryOf(col, p);
    const rgb = { r: 0, g: 0, b: 0 };
    out.getRGB(rgb, THREE.SRGBColorSpace);
    px[i] = Math.round(rgb.r * 255);
    px[i + 1] = Math.round(rgb.g * 255);
    px[i + 2] = Math.round(rgb.b * 255);
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = src.flipY;
  t.magFilter = src.magFilter;
  t.minFilter = src.minFilter;
  return t;
}

/** The hue most of a machine's plain painted surface shares (Kenney's yellow when it is all texture). */
function mainHue(root: THREE.Object3D): number {
  const count = new Map<number, number>();
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
      const lm = x as THREE.MeshLambertMaterial;
      if (!lm.color || lm.map || (lm.emissive && lm.emissive.getHex() !== 0)) continue;
      lm.color.getHSL(hsl, THREE.SRGBColorSpace);
      if (hsl.s <= 0.3 || hsl.l < 0.15 || hsl.l > 0.92) continue;
      // Weighed by size (vertices): baked machines have one mesh per colour.
      const k = Math.round(hsl.h * 24) % 24;
      count.set(k, (count.get(k) ?? 0) + (m.geometry.attributes.position?.count ?? 1));
    }
  });
  let best = -1;
  let n = 0;
  for (const [k, c] of count) if (c > n) (best = k), (n = c);
  return best < 0 ? 0.12 : best / 24;
}

/**
 * Repaint a machine in farm colours (the models are construction machines): each material once per scheme, by its
 * colour, or pixel by pixel for a texture. Copies, so shared mat() materials elsewhere keep their colours; emissive
 * parts (lights, the glow of a heat-tinted drill) are left alone.
 */
export function farmLivery(root: THREE.Object3D, scheme: LiveryScheme = "red", greys = false): void {
  const p: Paint = { sc: SCHEMES[scheme], main: mainHue(root), greys };
  const tag = `|${scheme}|${p.main}|${greys}`;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const paint = (x: THREE.Material): THREE.Material => {
      const lm = x as THREE.MeshLambertMaterial;
      if (!lm.color || (lm.emissive && lm.emissive.getHex() !== 0)) return x;
      let out = liveried.get(x.uuid + tag);
      if (!out) {
        const copy = x.clone() as THREE.MeshLambertMaterial;
        if (lm.map?.image) copy.map = liveryTexture(lm.map, p);
        else copy.color.copy(liveryOf(lm.color, p));
        out = copy;
        liveried.set(x.uuid + tag, out);
        // A material already painted this way stays as it is.
        liveried.set(out.uuid + tag, out);
      }
      return out;
    };
    m.material = Array.isArray(m.material) ? m.material.map(paint) : paint(m.material);
  });
}

